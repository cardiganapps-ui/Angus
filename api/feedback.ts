import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "./_cors.js";
import { getAuth, isWorkspaceMember } from "./_r2.js";

/* POST { workspaceId, kind, message, context? } → { id, notified }
   She tells us something is wrong, or asks for something. The row is
   inserted through a client bound to HER token — RLS decides, exactly
   as it would from the app — and then mailed to the admin through
   Resend. The row is the record and the mail is the notification: a
   mail failure answers 200 with notified:false, never a lost message.

   Env: RESEND_API_KEY (server-only), FEEDBACK_TO (defaults to the
   admin), FEEDBACK_FROM (defaults to the app's sender). Without the key
   the route still stores the row. */

const KINDS = new Set(["bug", "idea", "question"]);
const KIND_LABEL: Record<string, string> = { bug: "Falla", idea: "Idea", question: "Pregunta" };
const MAX_MESSAGE = 4000;
const MAX_CONTEXT_BYTES = 32_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function contextOf(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const text = JSON.stringify(raw);
  return text.length <= MAX_CONTEXT_BYTES ? (raw as Record<string, unknown>) : { truncated: true };
}

function plain(context: Record<string, unknown>): string {
  return Object.entries(context)
    .map(([k, v]) => {
      if (typeof v === "string") return `${k}: ${v}`;
      if (Array.isArray(v) && v.length === 0) return `${k}: —`;
      if (Array.isArray(v)) {
        // one line per entry, in order — a trail reads top to bottom
        return `${k}:\n` + v.map((x) => `  ${typeof x === "string" ? x : JSON.stringify(x)}`).join("\n");
      }
      return `${k}: ${JSON.stringify(v)}`;
    })
    .join("\n");
}

async function notify(input: { kind: string; message: string; email: string; workspaceId: string; id: string; context: Record<string, unknown> }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const to = process.env.FEEDBACK_TO || "gaxioladiego@gmail.com";
  const from = process.env.FEEDBACK_FROM || "Angus <angus@cardigan.mx>";
  const label = KIND_LABEL[input.kind] ?? input.kind;
  const firstLine = input.message.split("\n")[0].trim();
  const build = typeof input.context.build === "string" ? ` · ${input.context.build}` : "";
  const subject = `[Angus] ${label}: ${firstLine.length > 70 ? `${firstLine.slice(0, 70)}…` : firstLine}${build}`;
  const text = [
    `${label} de ${input.email}`,
    "",
    input.message,
    "",
    "— contexto —",
    `feedback id: ${input.id}`,
    `workspace: ${input.workspaceId}`,
    plain(input.context)
  ].join("\n");
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], reply_to: input.email, subject, text })
    });
    if (!res.ok) console.error("[feedback] resend", res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error("[feedback] resend", err instanceof Error ? err.message : String(err));
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed", code: "method_not_allowed" });

  try {
    const ctx = await getAuth(req);
    if (!ctx) return res.status(401).json({ error: "Unauthorized", code: "unauthorized" });

    const body = (req.body ?? {}) as { workspaceId?: unknown; kind?: unknown; message?: unknown; context?: unknown };
    const workspaceId = typeof body.workspaceId === "string" && UUID.test(body.workspaceId) ? body.workspaceId : null;
    const kind = typeof body.kind === "string" && KINDS.has(body.kind) ? body.kind : null;
    const message = typeof body.message === "string" ? body.message.trim().slice(0, MAX_MESSAGE) : "";
    if (!workspaceId || !kind || message.length === 0) {
      return res.status(400).json({ error: "Invalid feedback", code: "invalid_feedback" });
    }
    if (!(await isWorkspaceMember(ctx, workspaceId))) return res.status(403).json({ error: "Forbidden", code: "forbidden" });

    const context = contextOf(body.context);
    const { data, error } = await ctx.supabase
      .from("feedback")
      .insert({ workspace_id: workspaceId, kind, message, context })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[feedback] insert", error?.message);
      return res.status(500).json({ error: "Could not save feedback", code: "insert_failed" });
    }

    const notified = await notify({ kind, message, email: ctx.user.email ?? "", workspaceId, id: data.id as string, context });
    return res.status(200).json({ id: data.id, notified });
  } catch (err) {
    console.error("[feedback]", err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: "Feedback failed", code: "feedback_error" });
  }
}
