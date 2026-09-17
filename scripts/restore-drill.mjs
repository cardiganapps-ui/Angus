#!/usr/bin/env node
/* ── Restore drill ──
   Pulls the newest nightly dump out of R2, restores it into a throwaway
   Postgres 17 in Docker, and diffs exact per-table row counts against
   production. Prints PASS or FAIL and exits accordingly.

   This exists because a backup that has never been restored is a
   hypothesis, and the manual version of this drill — download, gunzip,
   docker run, psql, write a count query, eyeball two lists — is long
   enough that it does not get done. It is one command now:

     node --env-file=.env.local scripts/restore-drill.mjs

   Env (the same secrets the nightly job uses, plus nothing new):
     R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY
     R2_BACKUP_BUCKET       defaults to angus-backups
     SUPABASE_DB_URL        production, read-only here — used ONLY to
                            count rows for the comparison
     KEEP_CONTAINER=1       leave the container up to poke at it
     TARGET_DB_URL=…        restore into this instead of spawning Docker

   It never writes to production. The only production statement it runs
   is a count query. */
import { spawnSync } from "node:child_process";
import { createWriteStream, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

const BUCKET = process.env.R2_BACKUP_BUCKET || "angus-backups";
const PREFIX = "pg/";
const PROD_URL = process.env.SUPABASE_DB_URL;
const TARGET = process.env.TARGET_DB_URL || null;
const KEEP = process.env.KEEP_CONTAINER === "1";
const CONTAINER = "angus-restore-drill";
const PORT = 55432;

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  cleanup();
  process.exit(1);
}
function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", ...opts });
}
function cleanup() {
  if (!TARGET && !KEEP) run("docker", ["rm", "-f", CONTAINER]);
}

for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) {
  if (!process.env[k]) fail(`${k} is not set.`);
}
if (!PROD_URL) fail("SUPABASE_DB_URL is not set — without it there is nothing to compare the restore against.");

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

/* ── 1. Newest dump ── */
console.log(`• newest dump in r2://${BUCKET}/${PREFIX}…`);
const objects = [];
let cursor;
do {
  const page = await r2.send(
    new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX, ContinuationToken: cursor })
  );
  objects.push(...(page.Contents ?? []));
  cursor = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (cursor);

if (objects.length === 0) {
  fail(`no dumps under ${PREFIX}. Has the nightly job ever succeeded? (Actions → Nightly backup)`);
}
objects.sort((a, b) => (a.LastModified < b.LastModified ? 1 : -1));
const newest = objects[0];
const ageHours = (Date.now() - new Date(newest.LastModified).getTime()) / 3_600_000;
console.log(`  ${newest.Key}  ${Math.round(newest.Size / 1024)} KiB  ${ageHours.toFixed(1)}h old`);
if (ageHours > 48) console.log("  ⚠ older than 48h — the nightly job may have stopped running.");

const work = mkdtempSync(join(tmpdir(), "angus-drill-"));
const sqlPath = join(work, "dump.sql");
const body = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: newest.Key }));
await pipeline(body.Body, createGunzip(), createWriteStream(sqlPath));
console.log(`  unpacked ${Math.round(statSync(sqlPath).size / 1024)} KiB of SQL`);

/* ── 2. A target to restore into ── */
let targetUrl = TARGET;
if (!targetUrl) {
  if (!run("docker", ["--version"]).stdout) fail("docker is not available. Set TARGET_DB_URL to restore elsewhere.");
  console.log("• throwaway postgres:17…");
  run("docker", ["rm", "-f", CONTAINER]);
  const up = run("docker", [
    "run", "-d", "--name", CONTAINER,
    "-e", "POSTGRES_PASSWORD=drill",
    "-p", `${PORT}:5432`,
    "postgres:17"
  ]);
  if (up.status !== 0) fail(`could not start the container: ${up.stderr.trim()}`);
  targetUrl = `postgresql://postgres:drill@127.0.0.1:${PORT}/postgres`;

  process.stdout.write("  waiting for it");
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (run("docker", ["exec", CONTAINER, "pg_isready", "-U", "postgres"]).status === 0) {
      ready = true;
      break;
    }
    process.stdout.write(".");
    run("sleep", ["1"]);
  }
  console.log("");
  if (!ready) fail("postgres never became ready.");
}

/* The dump covers public + auth and is taken --no-owner --no-privileges,
   so it carries no grants to satisfy — but it does CREATE both schemas
   and it does name roles in its policies (`... TO authenticated`). What
   the first rehearsal (2026-09-17, run 35220700750) taught, in order:

   - `auth` must NOT be pre-created: the dump creates it and aborts on
     "schema already exists" if it is there. `public` exists in every
     fresh database, so it is dropped first for the same reason.
   - pgcrypto / uuid-ossp are installed into their own `extensions`
     schema, as on Supabase, and before `public` is dropped — an
     extension installs into the current schema, and the dump's
     gen_random_uuid() is pg_catalog's anyway.
   - The four Supabase roles must exist for the policies to restore.
     NOLOGIN, no privileges: the drill measures the dump, not auth. */
const PREP = `
  create schema if not exists extensions;
  create extension if not exists pgcrypto schema extensions;
  create extension if not exists "uuid-ossp" schema extensions;
  drop schema public cascade;
  do $$ declare r text; begin
    foreach r in array array['anon','authenticated','service_role','supabase_auth_admin'] loop
      if not exists (select 1 from pg_roles where rolname = r) then
        execute format('create role %I nologin', r);
      end if;
    end loop;
  end $$;`;
const prep = run("psql", [targetUrl, "-v", "ON_ERROR_STOP=1", "-c", PREP]);
if (prep.status !== 0) fail(`could not prepare the target: ${prep.stderr.trim()}`);

/* ── 3. Restore. ON_ERROR_STOP=1 is the whole point: without it psql
       prints every error, keeps going, and still exits 0. ── */
console.log("• restoring…");
const restore = run("psql", [targetUrl, "-v", "ON_ERROR_STOP=1", "-q", "-f", sqlPath]);
if (restore.status !== 0) {
  console.error(restore.stderr.trim().split("\n").slice(-15).join("\n"));
  fail("restore aborted on the error above. That is the drill working — the dump does not restore cleanly.");
}
console.log("  restored with no errors");

/* ── 4. Exact counts, both sides ──
   pg_stat_user_tables.n_live_tup is an estimate and reads 0 before
   ANALYZE, so it cannot answer "did every row arrive". */
const COUNTS = `
select table_name || '=' ||
  (xpath('/row/c/text()', query_to_xml(format('select count(*) c from %I.%I', 'public', table_name), false, true, '')))[1]::text
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;`;

function countsOf(url, label) {
  const out = run("psql", [url, "-v", "ON_ERROR_STOP=1", "-tAc", COUNTS]);
  if (out.status !== 0) fail(`could not count rows on ${label}: ${out.stderr.trim()}`);
  return new Map(
    out.stdout.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const [t, n] = l.split("=");
      return [t, Number(n)];
    })
  );
}

console.log("• comparing row counts…");
const prod = countsOf(PROD_URL, "production");
const restored = countsOf(targetUrl, "the restore");

const tables = [...new Set([...prod.keys(), ...restored.keys()])].sort();
let bad = 0;
let rows = 0;
for (const t of tables) {
  const p = prod.get(t);
  const r = restored.get(t);
  rows += p ?? 0;
  if (p === r) continue;
  bad += 1;
  console.error(`  ✗ ${t}: production ${p ?? "—"}, restored ${r ?? "—"}`);
}

/* auth.users is the one table outside public that matters: lose it and
   nobody can sign in to reach the data that did restore. */
const authProd = run("psql", [PROD_URL, "-tAc", "select count(*) from auth.users"]).stdout.trim();
const authRest = run("psql", [targetUrl, "-tAc", "select count(*) from auth.users"]).stdout.trim();
if (authProd !== authRest) {
  bad += 1;
  console.error(`  ✗ auth.users: production ${authProd}, restored ${authRest || "—"}`);
}

console.log(`  ${tables.length} tables, ${rows} rows, auth.users ${authProd}`);
rmSync(work, { recursive: true, force: true });
if (KEEP && !TARGET) console.log(`\n  container left up: psql "${targetUrl}"`);
cleanup();

if (bad > 0) {
  console.error(`\n✗ ${bad} table(s) do not match. This dump is NOT a usable backup.`);
  process.exit(1);
}
console.log(`\n✓ restore drill passed — ${newest.Key} restores clean and complete.`);
