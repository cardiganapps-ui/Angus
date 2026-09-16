#!/usr/bin/env node
/* ── Nightly database backup ──
   pg_dump -> gzip -> Cloudflare R2, with retention pruning.

   The project is on Supabase's free plan: no point-in-time recovery and
   no managed backups. The app is the only copy of one artist's business
   memory, so this script IS the disaster plan. It writes a real
   pg_dump, not a per-table JSON approximation, because a dump restores
   with psql and a JSON blob needs a program nobody has written yet.

   Env (GitHub Actions secrets, or .env.local for a manual run):
     SUPABASE_DB_URL        postgres connection string (session pooler)
     R2_ACCOUNT_ID
     R2_ACCESS_KEY_ID
     R2_SECRET_ACCESS_KEY
     R2_BACKUP_BUCKET       defaults to angus-backups
     BACKUP_RETENTION_DAYS  defaults to 30

   Usage:  node --env-file=.env.local scripts/backup-db.mjs
*/
import { spawnSync } from "node:child_process";
import { createReadStream, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";

const DB_URL = process.env.SUPABASE_DB_URL;
const BUCKET = process.env.R2_BACKUP_BUCKET || "angus-backups";
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 30);
const PREFIX = "pg/";

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!DB_URL) fail("SUPABASE_DB_URL is not set.");
for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) {
  if (!process.env[k]) fail(`${k} is not set.`);
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const local = join(tmpdir(), `angus-${stamp}.sql.gz`);
const key = `${PREFIX}angus-${stamp}.sql.gz`;

/* --no-owner / --no-privileges so the dump restores into a project whose
   roles differ from production's. Schemas are named explicitly: `auth`
   carries the accounts, `public` the data; Supabase's internal schemas
   (storage, realtime, vault) are not ours to restore. */
console.log("• pg_dump…");
const dump = spawnSync(
  "bash",
  [
    "-o",
    "pipefail",
    "-c",
    `pg_dump --no-owner --no-privileges --schema=public --schema=auth "$SUPABASE_DB_URL" | gzip -9 > "${local}"`
  ],
  { stdio: ["ignore", "inherit", "inherit"], env: process.env }
);
if (dump.status !== 0) fail(`pg_dump failed (exit ${dump.status}). Is pg_dump installed and the URL reachable?`);

const bytes = statSync(local).size;
// A dump that came back suspiciously small means pg_dump "succeeded"
// against nothing. Uploading it would overwrite good history with junk.
if (bytes < 4096) fail(`dump is only ${bytes} bytes — refusing to upload it as a backup.`);
console.log(`  ${(bytes / 1024).toFixed(0)} KiB`);

console.log("• upload…");
await r2.send(
  new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: createReadStream(local),
    ContentLength: bytes,
    ContentType: "application/gzip"
  })
);
unlinkSync(local);
console.log(`  r2://${BUCKET}/${key}`);

console.log(`• prune older than ${RETENTION_DAYS}d…`);
const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
let token;
const stale = [];
let kept = 0;
do {
  const page = await r2.send(
    new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX, ContinuationToken: token })
  );
  for (const obj of page.Contents ?? []) {
    if (obj.Key === key) continue;
    if (obj.LastModified && obj.LastModified.getTime() < cutoff) stale.push({ Key: obj.Key });
    else kept += 1;
  }
  token = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (token);

// Never prune down to nothing: if every remaining copy looks stale,
// something is wrong with the clock or the retention value, not with
// the backups.
if (stale.length > 0 && kept === 0) {
  console.log(`  refusing to prune ${stale.length} objects — that would leave no history but today's.`);
} else if (stale.length > 0) {
  for (let i = 0; i < stale.length; i += 1000) {
    await r2.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: stale.slice(i, i + 1000) } }));
  }
  console.log(`  deleted ${stale.length}, kept ${kept}`);
} else {
  console.log(`  nothing to prune, kept ${kept}`);
}

console.log("✓ backup complete");
