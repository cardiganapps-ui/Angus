#!/usr/bin/env node
/* ── Backup credentials, without repository secrets ──
   Runs only inside GitHub Actions. Asks GitHub for an OIDC token that
   says "I am a job of the backup workflow in cardiganapps-ui/Angus",
   presents it to the `backup-secrets` edge function, and exports what
   comes back into $GITHUB_ENV for the steps that follow — masked, so a
   value can never appear in a log.

   Modes:
     node scripts/backup-credentials.mjs            # issue → $GITHUB_ENV
     node scripts/backup-credentials.mjs report <success|failure> [json]
                                                    # record the outcome

   Why not repository secrets: nothing that maintains this project can
   set them (docs/handoff.md §2). The edge function already holds the
   database password and reads the R2 pair from Vault, so the runner
   proves who it is instead of carrying a copy. */
import { appendFileSync } from "node:fs";

const BROKER = process.env.BACKUP_BROKER_URL;
const AUDIENCE = "angus-backup";

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!BROKER) fail("BACKUP_BROKER_URL is not set.");
const reqUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const reqToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
if (!reqUrl || !reqToken) {
  fail("no OIDC request context — this runs only inside GitHub Actions with `permissions: id-token: write`.");
}

const idRes = await fetch(`${reqUrl}&audience=${encodeURIComponent(AUDIENCE)}`, {
  headers: { Authorization: `Bearer ${reqToken}` }
});
if (!idRes.ok) fail(`could not mint an OIDC token: HTTP ${idRes.status}`);
const { value: idToken } = await idRes.json();
if (!idToken) fail("OIDC response carried no token.");

const [mode = "issue", status, detailJson] = process.argv.slice(2);
const body =
  mode === "report"
    ? { action: "report", status, detail: detailJson ? JSON.parse(detailJson) : {} }
    : { action: mode };

const res = await fetch(BROKER, {
  method: "POST",
  headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
  body: JSON.stringify(body)
});
const text = await res.text();
if (!res.ok) fail(`broker answered HTTP ${res.status}: ${text}`);

if (mode === "report") {
  console.log(`• outcome recorded: ${text}`);
  process.exit(0);
}

const creds = JSON.parse(text);
const envFile = process.env.GITHUB_ENV;
if (!envFile) fail("GITHUB_ENV is not set.");
// Mask BEFORE the value is written anywhere the log could echo it.
for (const [k, v] of Object.entries(creds)) {
  if (typeof v !== "string" || !v) fail(`broker returned an empty ${k}`);
  console.log(`::add-mask::${v}`);
  appendFileSync(envFile, `${k}<<__EOF__\n${v}\n__EOF__\n`);
}
console.log(`• ${Object.keys(creds).length} credentials exported for this job`);
