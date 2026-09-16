// ── The tenant boundary, asserted ──
// RLS is the entire security model of this app: the anon key is public by
// design, and `is_workspace_member(workspace_id)` is the only thing standing
// between one account and another's rows. Nothing proved that. Migration 019
// revoked EXECUTE on that helper from PUBLIC, every read and write in the
// live app started returning `permission denied for function
// is_workspace_member`, and 020 reverted it — the corrective action was a
// comment in CLAUDE.md, not a test. This is the test.
//
// It signs in as TWO accounts and asserts, for every workspace-scoped table,
// that account B cannot read, write, or delete account A's rows. A boundary
// check is only meaningful when run as the role that will actually run it:
// `set local role authenticated` in a psql session still leaves you as
// `postgres`, which holds EXECUTE on everything, so a test written that way
// cannot fail. Hence two real sessions over PostgREST with the anon key.
//
//   node --env-file=.env.local scripts/rls-smoke.mjs
//
// Needs, beyond the usual VITE_SUPABASE_*:
//   RLS_A_EMAIL / RLS_A_PASS   one disposable account (playbook §9)
//   RLS_B_EMAIL / RLS_B_PASS   a second one, in a DIFFERENT workspace
// Neither may be the artist's account and neither may be the admin — the
// admin is a member of every workspace by design and would pass trivially.
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY;
const a = { email: process.env.RLS_A_EMAIL, password: process.env.RLS_A_PASS };
const b = { email: process.env.RLS_B_EMAIL, password: process.env.RLS_B_PASS };

if (!url || !anon || !a.email || !a.password || !b.email || !b.password) {
  console.error(
    "Need VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, RLS_A_EMAIL, RLS_A_PASS, RLS_B_EMAIL, RLS_B_PASS."
  );
  process.exit(2);
}

/* Every workspace-scoped table. Kept in FK order and deliberately identical
   to exportAll.ts's TABLES minus `workspaces`/`workspace_members`, which are
   asserted separately because they are scoped on `id`, not `workspace_id`. */
const TABLES = [
  "projects",
  "contacts",
  "events",
  "event_series",
  "sales",
  "payments",
  "installments",
  "expenses",
  "recurring_rules",
  "class_groups",
  "class_enrollments",
  "attendance",
  "courses",
  "assignments",
  "notes",
  "note_tags",
  "note_tag_links",
  "note_versions",
  "note_attachments",
  "documents"
];

async function session(who, creds) {
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword(creds);
  if (error || !data.session) {
    console.error(`✗ ${who}: sign-in failed — ${error?.message}`);
    process.exit(1);
  }
  const { data: ws, error: wsErr } = await client.from("workspaces").select("id").limit(1).single();
  if (wsErr || !ws) {
    console.error(`✗ ${who}: no workspace — ${wsErr?.message}`);
    process.exit(1);
  }
  return { client, workspaceId: ws.id, userId: data.session.user.id };
}

const A = await session("A", a);
const B = await session("B", b);

if (A.workspaceId === B.workspaceId) {
  console.error("✗ Both accounts resolve to the SAME workspace — this test cannot prove anything.");
  process.exit(2);
}
console.log(`A workspace ${A.workspaceId}\nB workspace ${B.workspaceId}\n`);

let failed = 0;
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  failed += 1;
};

// ── 1. B cannot READ anything scoped to A's workspace ──
console.log("read isolation");
for (const table of TABLES) {
  const { data, error } = await B.client.from(table).select("id").eq("workspace_id", A.workspaceId);
  // An error here is acceptable (the policy refused outright); rows are not.
  if (error) {
    console.log(`  · ${table}: refused (${error.code ?? "error"})`);
    continue;
  }
  if ((data ?? []).length > 0) fail(`${table}: B read ${data.length} of A's rows`);
  else console.log(`  ✓ ${table}`);
}

// ── 2. B cannot WRITE into A's workspace ──
// The `with check` half of the policy. A policy with `using` but no
// `with check` reads correctly and still lets a foreign row be inserted.
console.log("\nwrite isolation");
const FOREIGN_ROW = {
  projects: { title: "rls-smoke" },
  contacts: { name: "rls-smoke" },
  notes: { title: "rls-smoke" },
  sales: { title: "rls-smoke", amount: 1, date: "2026-01-01" },
  expenses: { title: "rls-smoke", amount: 1, date: "2026-01-01", category: "other" }
};
for (const [table, shape] of Object.entries(FOREIGN_ROW)) {
  /* Control first. A refusal only proves RLS if the SAME row shape is
     accepted into B's own workspace — otherwise a missing column or a
     check constraint would refuse it too and this test would pass for
     entirely the wrong reason, which is the kind of test that can never
     fail. Every column left unset here has a database default. */
  const { data: control, error: controlErr } = await B.client
    .from(table)
    .insert({ ...shape, workspace_id: B.workspaceId })
    .select("id");
  if (controlErr || (control ?? []).length === 0) {
    fail(`${table}: control insert into B's OWN workspace failed (${controlErr?.message}) — the foreign-insert check below would be meaningless, fix the row shape`);
    continue;
  }
  await B.client.from(table).delete().eq("id", control[0].id);

  const { data, error } = await B.client
    .from(table)
    .insert({ ...shape, workspace_id: A.workspaceId })
    .select("id");
  if (!error && (data ?? []).length > 0) {
    fail(`${table}: B INSERTED a row into A's workspace (id ${data[0].id}) — clean it up by hand`);
  } else {
    console.log(`  ✓ ${table}: accepted in B's own workspace, refused in A's (${error?.code ?? "no row"})`);
  }
}

// ── 3. B cannot DELETE A's rows ──
// A delete that matches nothing returns success, so this asserts on A's own
// count rather than on B's error: the only honest question is whether A's
// rows are still there afterwards.
console.log("\ndelete isolation");
for (const table of ["projects", "sales", "notes"]) {
  const { count: before } = await A.client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", A.workspaceId);
  await B.client.from(table).delete().eq("workspace_id", A.workspaceId);
  const { count: after } = await A.client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", A.workspaceId);
  if ((before ?? 0) !== (after ?? 0)) fail(`${table}: B deleted ${(before ?? 0) - (after ?? 0)} of A's rows`);
  else console.log(`  ✓ ${table}: ${after ?? 0} rows intact`);
}

// ── 4. The workspace row itself, and its membership list ──
console.log("\nworkspace isolation");
{
  const { data } = await B.client.from("workspaces").select("id").eq("id", A.workspaceId);
  if ((data ?? []).length > 0) fail("workspaces: B can see A's workspace row");
  else console.log("  ✓ workspaces");

  const { data: members } = await B.client
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", A.workspaceId);
  if ((members ?? []).length > 0) fail("workspace_members: B can enumerate A's members");
  else console.log("  ✓ workspace_members");
}

// ── 5. The control tables are RLS-on-no-policy: nobody reads them ──
console.log("\ncontrol tables");
for (const table of ["allowed_signups", "platform_admins"]) {
  const { data, error } = await B.client.from(table).select("*");
  if (!error && (data ?? []).length > 0) fail(`${table}: readable by an ordinary account`);
  else console.log(`  ✓ ${table}: ${error ? `refused (${error.code ?? "error"})` : "empty"}`);
}

// ── 6. The policy helpers are callable by `authenticated` ──
// The 019 regression, in the form it actually took: the helpers stayed
// correct and simply became un-executable by the role that runs them, so
// every query failed closed. A boundary that denies everyone is not a
// boundary that works.
console.log("\npolicy helpers are executable by the querying role");
{
  const { error } = await A.client.from("projects").select("id").limit(1);
  if (error && /permission denied for function/i.test(error.message ?? "")) {
    fail(`A cannot read her OWN rows — the 019 regression is back: ${error.message}`);
  } else {
    console.log("  ✓ a member can read her own workspace");
  }
}

console.log(failed === 0 ? "\n✓ tenant boundary holds" : `\n✗ ${failed} boundary failure(s)`);
process.exit(failed ? 1 : 0);
