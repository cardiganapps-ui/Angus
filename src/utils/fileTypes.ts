/* ── File types ──
   Pure helpers shared by the upload pipeline, the rows and the viewer:
   which MIME types we accept, their extensions, and how a size reads. */

export const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv"
};

const MIME_BY_EXT: Record<string, string> = { ...Object.fromEntries(Object.entries(EXT_BY_MIME).map(([m, e]) => [e, m])), jpeg: "image/jpeg" };

/** The type we'll declare to storage — the file's own when we accept it, else from its extension, else "". */
export function resolveMime(type: string, name: string): string {
  if (type && EXT_BY_MIME[type]) return type;
  const ext = (name.split(".").pop() || "").toLowerCase();
  return MIME_BY_EXT[ext] ?? "";
}

export function extensionFor(mime: string): string {
  return EXT_BY_MIME[mime] ?? "bin";
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

export function isPdfMime(mime: string): boolean {
  return mime === "application/pdf";
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
