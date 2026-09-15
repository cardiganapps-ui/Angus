import { useCallback } from "react";
import { useApp } from "../context/AppContext";
import type { Document } from "../types";
import { deleteFile, uploadFile } from "../lib/files";
import { makeId } from "../utils/id";
import { todayISO } from "../utils/dates";

/* ── useDocuments ──
   Material on top of the documents store: upload (bytes first, row
   only once R2 accepted them), links, rename, delete (purge, then the
   row — a failed purge leaves a recoverable orphan, never a dangling
   row). */

export interface DocumentLinks {
  courseId?: string | null;
  assignmentId?: string | null;
  projectId?: string | null;
  eventId?: string | null;
}

/** Objects are grouped by what they belong to, so a bucket listing reads like the app. */
export function documentFolder(workspaceId: string, links: DocumentLinks): string {
  const base = `ws/${workspaceId}`;
  if (links.assignmentId) return `${base}/tareas/${links.assignmentId}`;
  if (links.eventId) return `${base}/sesiones/${links.eventId}`;
  if (links.courseId) return `${base}/cursos/${links.courseId}`;
  if (links.projectId) return `${base}/piezas/${links.projectId}`;
  return `${base}/misc`;
}

export function matchesLinks(doc: Document, links: DocumentLinks): boolean {
  if (links.assignmentId) return doc.assignmentId === links.assignmentId;
  if (links.eventId) return doc.eventId === links.eventId;
  if (links.projectId) return doc.projectId === links.projectId;
  if (links.courseId) return doc.courseId === links.courseId;
  return true;
}

export function useDocuments() {
  const { workspaceId, documents, addDocument, updateDocument, removeDocument } = useApp();

  const upload = useCallback(
    async ({ file, links, name, onProgress }: { file: File; links: DocumentLinks; name?: string; onProgress?: (fraction: number) => void }): Promise<Document> => {
      const up = await uploadFile({ file, folder: documentFolder(workspaceId, links), onProgress });
      const doc: Document = {
        id: makeId(),
        kind: "file",
        name: (name?.trim() || up.name).slice(0, 200),
        r2Path: up.path,
        url: null,
        mime: up.mime,
        sizeBytes: up.size,
        width: up.width,
        height: up.height,
        courseId: links.courseId ?? null,
        assignmentId: links.assignmentId ?? null,
        projectId: links.projectId ?? null,
        eventId: links.eventId ?? null,
        createdAt: todayISO()
      };
      const ok = await addDocument(doc);
      if (!ok) {
        void deleteFile(up.path);
        throw new Error("row_failed");
      }
      return doc;
    },
    [workspaceId, addDocument]
  );

  const addLink = useCallback(
    async ({ url, name, links }: { url: string; name?: string; links: DocumentLinks }): Promise<Document | null> => {
      let host = "";
      try {
        host = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return null;
      }
      const doc: Document = {
        id: makeId(),
        kind: "link",
        name: (name?.trim() || host).slice(0, 200),
        r2Path: null,
        url,
        mime: "",
        sizeBytes: null,
        width: null,
        height: null,
        courseId: links.courseId ?? null,
        assignmentId: links.assignmentId ?? null,
        projectId: links.projectId ?? null,
        eventId: links.eventId ?? null,
        createdAt: todayISO()
      };
      const ok = await addDocument(doc);
      return ok ? doc : null;
    },
    [addDocument]
  );

  const rename = useCallback((id: string, name: string) => updateDocument(id, { name: name.trim().slice(0, 200) }), [updateDocument]);

  const remove = useCallback(
    async (doc: Document) => {
      if (doc.r2Path) await deleteFile(doc.r2Path);
      await removeDocument(doc.id);
    },
    [removeDocument]
  );

  const documentsFor = useCallback(
    (links: DocumentLinks) => documents.filter((d) => matchesLinks(d, links)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name)),
    [documents]
  );

  return { documents, upload, addLink, rename, remove, documentsFor };
}
