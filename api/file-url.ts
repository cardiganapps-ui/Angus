import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { applyCors } from "./_cors.js";
import { BUCKET, getAuth, getR2, inferTypeFromExt, isStorageConfigured, isWorkspaceMember, parsePath, PREVIEWABLE_TYPES } from "./_r2.js";

function safeFilename(path: string, name: unknown): string {
  const base = (typeof name === "string" && name.trim()) || path.split("/").pop() || "archivo";
  return base.replace(/[\r\n";\\]/g, "_").slice(0, 200);
}

/* POST { path, name? } → { url }: a 15-minute signed GET. Images and
   PDFs open inline (the viewer); anything else downloads, so R2 never
   serves a stored file as a page. Both overrides are part of the
   signature and can't be stripped. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed", code: "method_not_allowed" });
  if (!isStorageConfigured()) return res.status(503).json({ error: "Storage not configured", code: "storage_not_configured" });

  try {
    const ctx = await getAuth(req);
    if (!ctx) return res.status(401).json({ error: "Unauthorized", code: "unauthorized" });

    const { path, name } = (req.body ?? {}) as { path?: unknown; name?: unknown };
    const parsed = parsePath(path);
    if (!parsed) return res.status(400).json({ error: "Invalid path", code: "invalid_path" });
    if (!(await isWorkspaceMember(ctx, parsed.workspaceId))) return res.status(403).json({ error: "Forbidden", code: "forbidden" });

    const key = path as string;
    const type = inferTypeFromExt(key);
    const filename = safeFilename(key, name);
    const disposition = PREVIEWABLE_TYPES.has(type) ? `inline; filename="${filename}"` : `attachment; filename="${filename}"`;
    const url = await getSignedUrl(
      getR2(),
      new GetObjectCommand({ Bucket: BUCKET, Key: key, ResponseContentType: type, ResponseContentDisposition: disposition }),
      { expiresIn: 900 }
    );
    return res.status(200).json({ url, expiresIn: 900 });
  } catch (err) {
    const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    console.error("[file-url]", { name: e?.name, message: e?.message, http: e?.$metadata?.httpStatusCode });
    return res.status(500).json({ error: "File URL generation failed", code: "r2_error" });
  }
}
