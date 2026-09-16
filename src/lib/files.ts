import { apiFetch, isOffline } from "./api";
import type { IconName } from "../components/Icon";
import { makeId } from "../utils/id";
import { extensionFor, formatFileSize, isImageMime, isPdfMime, resolveMime as resolveMimeOf } from "../utils/fileTypes";

export { formatFileSize, isImageMime, isPdfMime };

/* ── Files on R2 ──
   The browser talks to R2 directly with URLs the functions sign:
   upload = presigned PUT (with progress), read = 15-minute signed GET
   cached per session, delete = purge. Photos are downscaled to 2048px
   before they leave the phone; HEIC becomes JPEG. Every failure is a
   StorageError with a code the UI can phrase; nothing fakes success. */

export type StorageErrorCode = "offline" | "not_configured" | "unauthorized" | "unsupported" | "too_large" | "failed";

export class StorageError extends Error {
  code: StorageErrorCode;
  constructor(code: StorageErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const ACCEPT_UPLOAD = "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv";

/** The type we'll declare to R2 — from the file, else from its extension. */
export function resolveMime(file: File): string {
  return resolveMimeOf(file.type, file.name);
}

export function fileIcon(mime: string, kind: "file" | "link" = "file"): IconName {
  if (kind === "link") return "link";
  if (isImageMime(mime)) return "image";
  return "file";
}

export function isHeic(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t === "image/heic" || t === "image/heif") return true;
  const n = file.name.toLowerCase();
  return n.endsWith(".heic") || n.endsWith(".heif");
}

/** iPhone photos are HEIC; most browsers can't show them. Converted to JPEG, or left alone if that fails. */
export async function maybeConvertHeic(file: File): Promise<File> {
  if (!isHeic(file)) return file;
  try {
    const mod = await import("heic2any");
    const out = await mod.default({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(out) ? out[0] : out;
    return new File([blob], file.name.replace(/\.(heic|heif)$/i, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}

const MAX_EDGE = 2048;

function loadImage(file: File): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export interface PreparedFile {
  file: File;
  mime: string;
  width: number | null;
  height: number | null;
}

/** JPEG/PNG/WebP over 2048px on a side are downscaled (JPEG 0.86); dimensions are read for every image. */
export async function prepareFile(input: File): Promise<PreparedFile> {
  const file = await maybeConvertHeic(input);
  const mime = resolveMime(file);
  if (!isImageMime(mime) || mime === "image/gif" || mime === "image/heic" || mime === "image/heif") {
    return { file, mime, width: null, height: null };
  }
  const img = await loadImage(file);
  if (!img) return { file, mime, width: null, height: null };
  const { naturalWidth: w, naturalHeight: h } = img;
  if (Math.max(w, h) <= MAX_EDGE) return { file, mime, width: w, height: h };
  const scale = MAX_EDGE / Math.max(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { file, mime, width: w, height: h };
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const outMime = mime === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outMime, 0.86));
  if (!blob) return { file, mime, width: w, height: h };
  const name = file.name.replace(/\.[a-z0-9]+$/i, "") + (outMime === "image/png" ? ".png" : ".jpg");
  return { file: new File([blob], name, { type: outMime, lastModified: file.lastModified }), mime: outMime, width: canvas.width, height: canvas.height };
}

function storageErrorFrom(code: string, status: number): StorageError {
  if (code === "offline" || code === "network") return new StorageError("offline", "Necesitas conexión para subir archivos.");
  if (code === "storage_not_configured" || code === "api_unavailable" || status === 404) {
    return new StorageError("not_configured", "El almacenamiento de archivos aún no está configurado.");
  }
  if (code === "unauthorized" || status === 401 || status === 403) return new StorageError("unauthorized", "Vuelve a iniciar sesión para subir archivos.");
  if (code === "unsupported_type" || status === 415) return new StorageError("unsupported", "Ese tipo de archivo no se puede guardar.");
  return new StorageError("failed", "No se pudo completar la subida.");
}

function putWithProgress(url: string, file: File, mime: string, onProgress?: (fraction: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", mime);
    if (onProgress) {
      xhr.upload.addEventListener("progress", (ev) => {
        if (ev.lengthComputable) onProgress(ev.loaded / ev.total);
      });
    }
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.onabort = () => resolve(false);
    xhr.send(file);
  });
}

export interface UploadedFile {
  path: string;
  name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
}

/** Prepares, signs and PUTs one file under `folder` (a ws/<workspace>/… prefix). Throws StorageError. */
export async function uploadFile({ file, folder, onProgress }: { file: File; folder: string; onProgress?: (fraction: number) => void }): Promise<UploadedFile> {
  if (isOffline()) throw new StorageError("offline", "Necesitas conexión para subir archivos.");
  const prepared = await prepareFile(file);
  if (!prepared.mime) throw new StorageError("unsupported", "Ese tipo de archivo no se puede guardar.");
  if (prepared.file.size > MAX_FILE_BYTES) throw new StorageError("too_large", "El archivo pesa más de 25 MB.");
  const ext = extensionFor(prepared.mime);
  const path = `${folder.replace(/\/$/, "")}/${makeId()}.${ext}`;
  // The signed URL is bound to this exact length (see api/upload-url.ts).
  const signed = await apiFetch<{ url: string }>("/api/upload-url", {
    path,
    contentType: prepared.mime,
    size: prepared.file.size
  });
  if (!signed.ok) throw storageErrorFrom(signed.error.code, signed.error.status);
  const ok = await putWithProgress(signed.data.url, prepared.file, prepared.mime, onProgress);
  if (!ok) throw new StorageError("failed", "No se pudo subir el archivo.");
  onProgress?.(1);
  return { path, name: prepared.file.name, mime: prepared.mime, size: prepared.file.size, width: prepared.width, height: prepared.height };
}

const urlCache = new Map<string, { url: string; expiresAt: number }>();

/** A signed GET for the object, cached until shortly before it expires. Null when it can't be signed. */
export async function fileUrl(path: string, name?: string): Promise<string | null> {
  const hit = urlCache.get(path);
  if (hit && hit.expiresAt > Date.now()) return hit.url;
  const res = await apiFetch<{ url: string; expiresIn?: number }>("/api/file-url", { path, name });
  if (!res.ok) return null;
  const ttl = ((res.data.expiresIn ?? 900) - 90) * 1000;
  urlCache.set(path, { url: res.data.url, expiresAt: Date.now() + ttl });
  return res.data.url;
}

/** Purges the object. Resolves false when the purge didn't happen (the caller still drops the row). */
export async function deleteFile(path: string): Promise<boolean> {
  const res = await apiFetch<{ ok: boolean }>("/api/delete-file", { path });
  urlCache.delete(path);
  return res.ok;
}

export function storageErrorMessage(err: unknown): string {
  if (err instanceof StorageError) return err.message;
  return "No se pudo completar la subida.";
}
