// End-to-end check of the Material API against a deployment:
// sign in → presigned PUT → upload bytes → signed GET → read them back →
// delete → confirm the GET now 404s. Uses a disposable account
// (playbook §9) and that account's own workspace.
//
//   API_BASE=https://angus.cardigan.mx E2E_EMAIL=… E2E_PASS=… \
//   node --env-file=.env.local scripts/r2-smoke.mjs
import { createClient } from "@supabase/supabase-js";

const API = (process.env.API_BASE || "https://angus.cardigan.mx").replace(/\/$/, "");
const url = process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY;
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASS;
if (!url || !anon || !email || !password) {
  console.error("Need VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_EMAIL, E2E_PASS.");
  process.exit(2);
}

const supabase = createClient(url, anon, { auth: { persistSession: false } });
const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });
if (authError || !auth.session) {
  console.error("Sign-in failed:", authError?.message);
  process.exit(1);
}
const token = auth.session.access_token;
const { data: ws } = await supabase.from("workspaces").select("id").limit(1).single();
if (!ws) {
  console.error("No workspace for this account.");
  process.exit(1);
}

async function api(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

/* parsePath now enforces the shape CLAUDE.md always documented:
   ws/<workspace>/<folder>/<uuid>.<ext>. A readable "smoke-123.txt" is
   no longer a legal key. */
const uuid = () => crypto.randomUUID();
const path = `ws/${ws.id}/misc/${uuid()}.txt`;
const body = `angus r2 smoke ${new Date().toISOString()}`;
const size = new TextEncoder().encode(body).length;
let failed = false;
const step = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
};

const unauth = await fetch(`${API}/api/file-url`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) });
step("file-url without a token is 401", unauth.status === 401, `got ${unauth.status}`);

const bad = await api("/api/upload-url", { path: "ws/../etc/passwd", contentType: "text/plain", size });
step("traversal path is rejected", bad.status === 400, `got ${bad.status}`);

const badFolder = await api("/api/upload-url", { path: `ws/${ws.id}/secretos/${uuid()}.txt`, contentType: "text/plain", size });
step("a folder outside the allowlist is rejected", badFolder.status === 400, `got ${badFolder.status}`);

const badName = await api("/api/upload-url", { path: `ws/${ws.id}/misc/anything.txt`, contentType: "text/plain", size });
step("a filename that is not a uuid is rejected", badName.status === 400, `got ${badName.status}`);

/* A well-SHAPED path in a workspace she does not belong to: this has to
   fail on membership (403), not on the shape (400), or it stops testing
   the tenant boundary at all. */
const foreign = await api("/api/upload-url", { path: `ws/00000000-0000-0000-0000-000000000000/misc/${uuid()}.txt`, contentType: "text/plain", size });
step("another workspace is forbidden", foreign.status === 403, `got ${foreign.status}`);

const html = await api("/api/upload-url", { path, contentType: "text/html", size });
step("text/html is refused", html.status === 415, `got ${html.status}`);

const noSize = await api("/api/upload-url", { path, contentType: "text/plain" });
step("a PUT with no declared size is refused", noSize.status === 413, `got ${noSize.status}`);

const huge = await api("/api/upload-url", { path, contentType: "text/plain", size: 26 * 1024 * 1024 });
step("a size over the cap is refused", huge.status === 413, `got ${huge.status}`);

const signed = await api("/api/upload-url", { path, contentType: "text/plain", size });
step("upload-url signs a PUT", signed.status === 200 && !!signed.json.url, `got ${signed.status} ${signed.json.code ?? ""}`);
if (signed.status === 503) {
  console.error("Storage is not configured on this deployment (R2_* env vars).");
  process.exit(1);
}

/* ContentLength is a SIGNED header now, so this is the step that proves
   the whole upload path still works. If it 403s with a signature error,
   every upload in the app is broken. */
const put = await fetch(signed.json.url, { method: "PUT", headers: { "Content-Type": "text/plain" }, body });
step("PUT to R2 succeeds with the signed length", put.ok, `got ${put.status}`);

const wrongLength = await api("/api/upload-url", { path: `ws/${ws.id}/misc/${uuid()}.txt`, contentType: "text/plain", size });
if (wrongLength.status === 200) {
  const mismatch = await fetch(wrongLength.json.url, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: `${body} and then some more bytes than were declared`
  });
  step("a body longer than the signed length is rejected", !mismatch.ok, `got ${mismatch.status}`);
}

const get = await api("/api/file-url", { path, name: "smoke.txt" });
step("file-url signs a GET", get.status === 200 && !!get.json.url, `got ${get.status}`);
const read = await fetch(get.json.url);
const text = await read.text();
step("bytes round-trip", read.ok && text === body, `got ${read.status}`);
step("non-previewable type downloads", /attachment/.test(read.headers.get("content-disposition") ?? ""), read.headers.get("content-disposition") ?? "");

const del = await api("/api/delete-file", { path });
step("delete-file purges", del.status === 200, `got ${del.status}`);
const gone = await fetch(get.json.url);
step("object is gone", gone.status === 404, `got ${gone.status}`);

await supabase.auth.signOut();
process.exit(failed ? 1 : 0);
