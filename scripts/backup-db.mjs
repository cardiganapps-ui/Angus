#!/usr/bin/env node
/* ── Nightly backup ──
   pg_dump -> gzip -> Cloudflare R2 with retention pruning, then a
   server-side mirror of the documents bucket.

   The project is on Supabase's free plan: no point-in-time recovery and
   no managed backups. The app is the only copy of one artist's business
   memory, so this script IS the disaster plan. It writes a real
   pg_dump, not a per-table JSON approximation, because a dump restores
   with psql and a JSON blob needs a program nobody has written yet.

   The dump alone is not the whole picture: `documents` and
   `note_attachments` rows are pointers into the documents bucket, so a
   restored database would faithfully preserve paths to photos that no
   longer exist. The mirror step copies those bytes too.

   Env (in Actions, exported by scripts/backup-credentials.mjs from the
   backup-secrets edge function — no repository secrets; .env.local for
   a manual run):
     SUPABASE_DB_URL        postgres connection string (session pooler)
     R2_ACCOUNT_ID
     R2_ACCESS_KEY_ID
     R2_SECRET_ACCESS_KEY
     R2_BACKUP_BUCKET       defaults to angus-backups
     R2_BUCKET_NAME         documents bucket to mirror; defaults to angus-documents
     BACKUP_RETENTION_DAYS  defaults to 30

   Usage:  node --env-file=.env.local scripts/backup-db.mjs
*/
import { spawnSync } from "node:child_process";
import { appendFileSync, createReadStream, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";

const DB_URL = process.env.SUPABASE_DB_URL;
const BUCKET = process.env.R2_BACKUP_BUCKET || "angus-backups";
const DOCS_BUCKET = process.env.R2_BUCKET_NAME || "angus-documents";
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 30);
const PREFIX = "pg/";
const FILES_PREFIX = "files/";

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!DB_URL) fail("SUPABASE_DB_URL is not set.");
for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) {
  if (!process.env[k]) fail(`${k} is not set.`);
}
// Mirroring a bucket into itself would copy every object back under
// files/, then mirror those copies on the next run. The two buckets are
// separate on purpose (docs/handoff.md §2.1).
if (DOCS_BUCKET === BUCKET) {
  fail(`R2_BUCKET_NAME and R2_BACKUP_BUCKET are both "${BUCKET}" — refusing to mirror a bucket into itself.`);
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

/* One page is 1000 keys: anything that reads a bucket has to follow the
   continuation token, or it prunes and re-copies against a list that
   silently stops a third of the way through. */
async function listAll(bucket, prefix) {
  const out = [];
  let cursor;
  do {
    const page = await r2.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: cursor })
    );
    out.push(...(page.Contents ?? []));
    cursor = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (cursor);
  return out;
}

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
// Lets the workflow's outcome report name the object it wrote.
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `key=${key}\nbytes=${bytes}\n`);

console.log(`• prune older than ${RETENTION_DAYS}d…`);
const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
const stale = [];
let kept = 0;
for (const obj of await listAll(BUCKET, PREFIX)) {
  if (obj.Key === key) continue;
  if (obj.LastModified && obj.LastModified.getTime() < cutoff) stale.push({ Key: obj.Key });
  else kept += 1;
}

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

/* Nothing under files/ is ever pruned. A photo she deleted last month is
   precisely the object a restore is wanted for, and the whole bucket is
   smaller than a month of dumps. */
console.log(`• mirror r2://${DOCS_BUCKET} → ${BUCKET}/${FILES_PREFIX}…`);

// R2 quotes ETags. The app uploads with a single presigned PUT, so an
// ETag is the content MD5 and survives a server-side copy: same size +
// same ETag means the backup already holds these exact bytes. Anything
// else is re-copied — overwriting a stale or truncated copy is the safe
// direction.
const etag = (raw) => (raw ?? "").replace(/"/g, "");
const mirrored = new Map(
  (await listAll(BUCKET, FILES_PREFIX)).map((o) => [o.Key, { size: o.Size, etag: etag(o.ETag) }])
);
const objects = await listAll(DOCS_BUCKET);

// An empty source against a non-empty mirror means the bucket name or
// the credentials changed, not that she deleted her studio.
if (objects.length === 0 && mirrored.size > 0) {
  fail(`${DOCS_BUCKET} lists no objects but ${mirrored.size} are already mirrored — check R2_BUCKET_NAME.`);
}

let copied = 0;
let skipped = 0;
let copiedBytes = 0;
let broken = 0;
// Sequential: the bytes never touch the runner, so a copy costs one
// request, and a nightly run only ever touches what changed.
for (const obj of objects) {
  const dest = `${FILES_PREFIX}${obj.Key}`;
  const have = mirrored.get(dest);
  if (have && have.size === obj.Size && have.etag === etag(obj.ETag)) {
    skipped += 1;
    continue;
  }
  try {
    await r2.send(
      new CopyObjectCommand({
        Bucket: BUCKET,
        Key: dest,
        CopySource: [DOCS_BUCKET, ...obj.Key.split("/")].map(encodeURIComponent).join("/")
      })
    );
    copied += 1;
    copiedBytes += obj.Size ?? 0;
  } catch (err) {
    broken += 1;
    console.error(`  ✗ ${obj.Key}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
console.log(
  `  copied ${copied} (${(copiedBytes / 1_048_576).toFixed(1)} MiB), skipped ${skipped}, of ${objects.length}`
);
if (broken > 0) fail(`${broken} object(s) failed to copy — the file backup is incomplete.`);

console.log("✓ backup complete");
