import type { VercelRequest, VercelResponse } from "@vercel/node";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { applyCors } from "./_cors.js";
import { BUCKET, getAuth, getR2, isStorageConfigured, isWorkspaceMember, parsePath } from "./_r2.js";

/* POST { path } → { ok }: purges one object. The client deletes the
   row afterwards; a purge that fails leaves a recoverable orphan, never
   a dangling row. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed", code: "method_not_allowed" });
  if (!isStorageConfigured()) return res.status(503).json({ error: "Storage not configured", code: "storage_not_configured" });

  try {
    const ctx = await getAuth(req);
    if (!ctx) return res.status(401).json({ error: "Unauthorized", code: "unauthorized" });

    const { path } = (req.body ?? {}) as { path?: unknown };
    const parsed = parsePath(path);
    if (!parsed) return res.status(400).json({ error: "Invalid path", code: "invalid_path" });
    if (!(await isWorkspaceMember(ctx, parsed.workspaceId))) return res.status(403).json({ error: "Forbidden", code: "forbidden" });

    await getR2().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: path as string }));
    return res.status(200).json({ ok: true });
  } catch (err) {
    const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    console.error("[delete-file]", { name: e?.name, message: e?.message, http: e?.$metadata?.httpStatusCode });
    return res.status(500).json({ error: "File deletion failed", code: "r2_error" });
  }
}
