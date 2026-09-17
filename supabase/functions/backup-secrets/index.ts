/* ── backup-secrets ──
   Hands the nightly backup runner its credentials, so the GitHub
   workflow needs NO repository secrets at all.

   Why this exists: the runner has pg_dump and can reach the database;
   the agent sessions that maintain this project can do neither, and are
   also barred (by egress policy) from GitHub's secrets API. The one
   place that already holds the database password is the edge runtime —
   SUPABASE_DB_URL is injected into every function — and Vault can hold
   the R2 key pair. So the runner proves who it is and asks here.

   Who it trusts: a GitHub Actions OIDC token, verified against GitHub's
   JWKS, whose claims say it was minted for THIS repository by THIS
   workflow file. That is the same trust boundary as repository secrets
   (anyone who can run a workflow here could read those too); a fork's
   token carries the fork's name and is refused.

   What it returns: the session-pooler connection string (runners have
   no IPv6 route, so the direct host in SUPABASE_DB_URL would time out)
   and the R2 pair + bucket names from Vault. Every issuance and every
   completion report lands in ops.backup_events, which is what
   public.backup_status() reads — a backup that stops running is only a
   problem if nobody notices, and that is the table that notices.

   verify_jwt is OFF for this function on purpose: the bearer is
   GitHub's token, not a Supabase one, and this file is the whole check. */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "angus-backup";
const REPOSITORY = "cardiganapps-ui/Angus";
// Which workflow may ask for what. The backup gets the backup set; the
// one-shot protect-main workflow (TEMPORARY, docs/handoff.md §8) gets
// the GitHub admin token and nothing else.
const GRANTS: Record<string, { actions: Set<string>; events: Set<string> }> = {
  ".github/workflows/backup.yml": {
    actions: new Set(["issue", "report"]),
    events: new Set(["schedule", "workflow_dispatch"]),
  },
  ".github/workflows/protect-main.yml": {
    actions: new Set(["github_admin"]),
    events: new Set(["push", "workflow_dispatch"]),
  },
};
// Session mode, port 5432 — pg_dump needs session state (docs/handoff.md §2.2).
const POOLER_HOST = "aws-0-us-east-1.pooler.supabase.com";
const VAULT_KEYS = ["r2_account_id", "r2_access_key_id", "r2_secret_access_key"] as const;

const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`));

type Claims = {
  repository?: string;
  job_workflow_ref?: string;
  event_name?: string;
  actor?: string;
  run_id?: string;
  ref?: string;
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function verifyRunner(req: Request, action: string): Promise<Claims | Response> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json(401, { error: "missing bearer" });

  let claims: Claims;
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: ISSUER, audience: AUDIENCE });
    claims = payload as Claims;
  } catch (e) {
    return json(401, { error: "token rejected", detail: e instanceof Error ? e.message : String(e) });
  }

  // job_workflow_ref is "<owner>/<repo>/<path>@<ref>". Bind to the path,
  // not the ref: a branch of this repo is already inside the trust
  // boundary, a fork never is (its token names the fork).
  const wfPath = (claims.job_workflow_ref ?? "").split("@")[0];
  const grant = Object.entries(GRANTS).find(([w]) => wfPath === `${REPOSITORY}/${w}`)?.[1];
  const ok = claims.repository === REPOSITORY && grant !== undefined &&
    grant.actions.has(action) && grant.events.has(claims.event_name ?? "");
  if (!ok) {
    console.warn("refused", {
      repository: claims.repository,
      job_workflow_ref: claims.job_workflow_ref,
      event_name: claims.event_name,
      action,
    });
    return json(403, { error: "this workflow of this repository may not perform that action" });
  }
  return claims;
}

function poolerUrl(direct: string): string {
  const u = new URL(direct);
  const ref = new URL(Deno.env.get("SUPABASE_URL")!).hostname.split(".")[0];
  const pw = decodeURIComponent(u.password);
  return `postgresql://postgres.${ref}:${encodeURIComponent(pw)}@${POOLER_HOST}:5432${u.pathname || "/postgres"}`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });

  let body: { action?: string; status?: string; detail?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // an empty body means "issue"
  }
  const action = body.action ?? "issue";

  const who = await verifyRunner(req, action);
  if (who instanceof Response) return who;

  const direct = Deno.env.get("SUPABASE_DB_URL");
  if (!direct) return json(500, { error: "SUPABASE_DB_URL is not injected" });

  const sql = postgres(direct, { prepare: false, connect_timeout: 10 });
  try {
    if (action === "github_admin") {
      const [row] = await sql<{ decrypted_secret: string }[]>`
        select decrypted_secret from vault.decrypted_secrets where name = 'github_admin_pat'`;
      if (!row) return json(503, { error: "vault is missing secrets", missing: ["github_admin_pat"] });
      console.warn("github admin token issued", { actor: who.actor, run_id: who.run_id });
      return json(200, { GITHUB_ADMIN_TOKEN: row.decrypted_secret });
    }

    if (action === "report") {
      const status = body.status === "success" ? "completed" : "failed";
      await sql`
        insert into ops.backup_events (kind, actor, run_id, git_ref, workflow, detail)
        values (${status}, ${who.actor ?? null}, ${who.run_id ?? null}, ${who.ref ?? null},
                ${who.job_workflow_ref ?? null}, ${sql.json(body.detail ?? {})})`;
      return json(200, { ok: true, recorded: status });
    }

    const rows = await sql<{ name: string; decrypted_secret: string }[]>`
      select name, decrypted_secret from vault.decrypted_secrets
      where name = any(${[...VAULT_KEYS, "r2_backup_bucket", "r2_bucket_name"]})`;
    const vault = Object.fromEntries(rows.map((r) => [r.name, r.decrypted_secret]));
    const missing = VAULT_KEYS.filter((k) => !vault[k]);
    if (missing.length > 0) {
      // Loud, specific, and red on the runner: the workflow must never
      // "succeed" by skipping the upload.
      return json(503, { error: "vault is missing secrets", missing });
    }

    await sql`
      insert into ops.backup_events (kind, actor, run_id, git_ref, workflow, detail)
      values ('issued', ${who.actor ?? null}, ${who.run_id ?? null}, ${who.ref ?? null},
              ${who.job_workflow_ref ?? null}, '{}'::jsonb)`;

    return json(200, {
      SUPABASE_DB_URL: poolerUrl(direct),
      R2_ACCOUNT_ID: vault.r2_account_id,
      R2_ACCESS_KEY_ID: vault.r2_access_key_id,
      R2_SECRET_ACCESS_KEY: vault.r2_secret_access_key,
      R2_BACKUP_BUCKET: vault.r2_backup_bucket ?? "angus-backups",
      R2_BUCKET_NAME: vault.r2_bucket_name ?? "angus-documents",
    });
  } catch (e) {
    console.error("broker failure", e);
    return json(500, { error: "broker failure", detail: e instanceof Error ? e.message : String(e) });
  } finally {
    await sql.end({ timeout: 2 });
  }
});
