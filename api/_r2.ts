import { S3Client } from "@aws-sdk/client-s3";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { VercelRequest } from "@vercel/node";

/* ── R2 + auth helpers for the serverless functions ──
   Long-lived R2 access keys only (R2 → Manage R2 API Tokens):
   R2_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY, bucket
   R2_BUCKET_NAME (default angus-documents). Nothing here ever touches
   a service-role key: the caller's JWT is verified with the anon key
   and reused for a Supabase client, so RLS decides what she can see.

   Since @aws-sdk/client-s3 v3.729 the default checksum middleware bakes
   x-amz-checksum headers into presigned URLs; a browser PUT doesn't
   send them and R2 rejects the signature. WHEN_REQUIRED restores the
   plain presigned PUT. */

export const BUCKET = process.env.R2_BUCKET_NAME || "angus-documents";

export function isStorageConfigured(): boolean {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
}

export function getR2(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? ""
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED"
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* The folders src/lib/files.ts actually writes to. CLAUDE.md has always
   documented this allowlist as enforced; until now the regex checked
   only the ws/<uuid>/ prefix and accepted any tail, so the doc
   described a control that did not exist. The tenant boundary never
   depended on it — isWorkspaceMember is what stops cross-workspace
   access — but a claim about a security control has to be true. */
const FOLDERS = ["cursos", "tareas", "piezas", "sesiones", "notas", "misc"] as const;

/* Every object lives at ws/<workspace_id>/<folder>/<uuid>.<ext>: no
   traversal, no empty segments, a workspace id and a filename that both
   parse. Membership is checked separately against the database. */
export function parsePath(path: unknown): { workspaceId: string; folder: string } | null {
  if (typeof path !== "string" || path.length === 0 || path.length > 512) return null;
  if (path.includes("..") || path.includes("//") || path.includes("\\")) return null;
  const m = /^ws\/([0-9a-fA-F-]{36})\/([a-z]+)\/([0-9a-fA-F-]{36})\.([a-z0-9]{1,8})$/.exec(path);
  if (!m || !UUID.test(m[1]) || !UUID.test(m[3])) return null;
  if (!(FOLDERS as readonly string[]).includes(m[2])) return null;
  return { workspaceId: m[1].toLowerCase(), folder: m[2] };
}

/* Ceiling for a signed PUT, matching MAX_FILE_BYTES in src/lib/files.ts.
   The client-side check is advisory once a URL is in hand — the URL is
   the capability — so the signature has to carry the bound too. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface AuthContext {
  user: User;
  /** A client acting as the caller — RLS applies to every query. */
  supabase: SupabaseClient;
}

export async function getAuth(req: VercelRequest): Promise<AuthContext | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const url = process.env.SUPABASE_URL ?? "";
  const anon = process.env.SUPABASE_ANON_KEY ?? "";
  if (!url || !anon) return null;
  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const {
    data: { user },
    error
  } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return { user, supabase };
}

/** True when RLS lets the caller see the workspace row (member or admin). */
export async function isWorkspaceMember(ctx: AuthContext, workspaceId: string): Promise<boolean> {
  const { data, error } = await ctx.supabase.from("workspaces").select("id").eq("id", workspaceId).maybeSingle();
  return !error && !!data;
}

export function inferTypeFromExt(path: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  const ext = m ? m[1].toLowerCase() : "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv"
  };
  return map[ext] || "application/octet-stream";
}

/* What a presigned PUT may declare. R2 stores and serves this type, so
   anything a browser would render as code (html, svg) stays out. */
export const ALLOWED_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
  "text/csv"
]);

export const PREVIEWABLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "application/pdf"]);
