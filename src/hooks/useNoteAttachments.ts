import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import type { NoteAttachment } from "../types";
import { deleteFile, fileUrl, uploadFile } from "../lib/files";
import { makeId } from "../utils/id";
import { todayISO } from "../utils/dates";

/* ── Note attachments ──
   Images inside a note: uploaded under ws/<workspace>/notas/<note>/…,
   one row per image, referenced from the body as
   ![](attachment:<id>). Deleting one purges the object, drops the row
   and clears the cover if it was the cover. */

export function useNoteAttachments() {
  const { workspaceId, noteAttachments, addNoteAttachment, removeNoteAttachment, notes, updateNote } = useApp();

  const upload = useCallback(
    async (noteId: string, file: File, onProgress?: (fraction: number) => void): Promise<NoteAttachment> => {
      const up = await uploadFile({ file, folder: `ws/${workspaceId}/notas/${noteId}`, onProgress });
      const row: NoteAttachment = {
        id: makeId(),
        noteId,
        r2Path: up.path,
        mime: up.mime,
        sizeBytes: up.size,
        width: up.width,
        height: up.height,
        createdAt: todayISO()
      };
      const ok = await addNoteAttachment(row);
      if (!ok) {
        void deleteFile(up.path);
        throw new Error("row_failed");
      }
      return row;
    },
    [workspaceId, addNoteAttachment]
  );

  const remove = useCallback(
    async (attachment: NoteAttachment) => {
      const note = notes.find((n) => n.id === attachment.noteId);
      if (note?.coverAttachmentId === attachment.id) await updateNote(note.id, { coverAttachmentId: null });
      await deleteFile(attachment.r2Path);
      await removeNoteAttachment(attachment.id);
    },
    [notes, updateNote, removeNoteAttachment]
  );

  /** Purges every object of a note (before the note itself goes). Best-effort. */
  const purgeForNote = useCallback(
    async (noteId: string) => {
      await Promise.all(noteAttachments.filter((a) => a.noteId === noteId).map((a) => deleteFile(a.r2Path).catch(() => false)));
    },
    [noteAttachments]
  );

  return { noteAttachments, upload, remove, purgeForNote };
}

export interface TileState {
  url?: string;
  failed?: true;
}

/** Resolves a note's attachments to signed URLs once, shared by the strip and the inline images. */
export function useAttachmentSrc(noteId: string) {
  const { noteAttachments } = useApp();
  const rows = useMemo(() => noteAttachments.filter((a) => a.noteId === noteId), [noteAttachments, noteId]);
  const [tiles, setTiles] = useState<Record<string, TileState>>({});
  const inflight = useRef(new Set<string>());

  useEffect(() => {
    let alive = true;
    const live = new Set(rows.map((r) => r.id));
    setTiles((prev) => {
      const next: Record<string, TileState> = {};
      let changed = false;
      for (const k of Object.keys(prev)) {
        if (live.has(k)) next[k] = prev[k];
        else changed = true;
      }
      return changed ? next : prev;
    });
    for (const row of rows) {
      if (tiles[row.id] || inflight.current.has(row.id)) continue;
      inflight.current.add(row.id);
      void fileUrl(row.r2Path)
        .then((url) => {
          if (!alive) return;
          setTiles((prev) => ({ ...prev, [row.id]: url ? { url } : { failed: true } }));
        })
        .finally(() => inflight.current.delete(row.id));
    }
    return () => {
      alive = false;
    };
    // tiles intentionally omitted: only newly seen rows resolve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const retryTile = useCallback((id: string) => {
    setTiles((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  return { rows, tiles, retryTile };
}
