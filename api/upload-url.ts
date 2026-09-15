import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { applyCors } from "./_cors.js";
import { ALLOWED_UPLOAD_TYPES, BUCKET, getAuth, getR2, isStorageConfigured, isWorkspaceMember, parsePath } from "./_r2.js";

/* POST { path, contentType } → { url }: a 5-minute presigned PUT so
   the browser sends the bytes straight to R2. The path must sit under
   a workspace she belongs to; the type must be one we're willing to
   serve back. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed", code: "method_not_allowed" });
  if (!isStorageConfigured()) return res.status(503).json({ error: "Storage not configured", code: "storage_not_configured" });

  try {
    const ctx = await getAuth(req);
    if (!ctx) return res.status(401).json({ error: "Unauthorized", code: "unauthorized" });

    const { path, contentType } = (req.body ?? {}) as { path?: unknown; contentType?: unknown };
    const parsed = parsePath(path);
    if (!parsed) return res.status(400).json({ error: "Invalid path", code: "invalid_path" });
    if (!(await isWorkspaceMember(ctx, parsed.workspaceId))) return res.status(403).json({ error: "Forbidden", code: "forbidden" });

    const ct = typeof contentType === "string" ? contentType : "application/octet-stream";
    if (!ALLOWED_UPLOAD_TYPES.has(ct)) return res.status(415).json({ error: "Unsupported content type", code: "unsupported_type" });

    const url = await getSignedUrl(getR2(), new PutObjectCommand({ Bucket: BUCKET, Key: path as string, ContentType: ct }), { expiresIn: 300 });
    return res.status(200).json({ url });
  } catch (err) {
    const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    console.error("[upload-url]", { name: e?.name, message: e?.message, http: e?.$metadata?.httpStatusCode });
    return res.status(500).json({ error: "Upload failed", code: "r2_error" });
  }
}
