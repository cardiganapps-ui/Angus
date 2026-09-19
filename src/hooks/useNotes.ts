import { useCallback, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { supabase } from "../lib/supabase";
import type { Note, NoteTag, NoteVersion, ScheduleEvent } from "../types";
import { deleteFile } from "../lib/files";
import { NOTE_TEMPLATES, applyTemplate } from "../data/noteTemplates";
import { makeId } from "../utils/id";
import { formatWithWeekday, todayISO } from "../utils/dates";

/* ── useNotes ──
   The note operations the editor and the list need, on top of the
   stores in AppContext: create with links, save (+ a server-side
   version snapshot), restore, pin, link, tags, and full-text search.
   Every write goes through the optimistic stores; the snapshot RPC is
   best-effort and never blocks a save. */

export interface NoteLinks {
  courseId?: string | null;
  eventId?: string | null;
  assignmentId?: string | null;
  projectId?: string | null;
}

const inflightSessionNotes = new Map<string, Promise<Note | null>>();

export function useNotes() {
  const {
    workspaceId,
    notes,
    addNote,
    updateNote,
    removeNote,
    removeNotes,
    noteTags,
    noteTagLinks,
    addNoteTag,
    findNoteTagByLabel,
    addNoteTagLink,
    removeNoteTagLink,
    noteAttachments
  } = useApp();

  const createNote = useCallback(
    async (input: { title?: string; content?: string } & NoteLinks): Promise<Note | null> => {
      const now = new Date().toISOString();
      const note: Note = {
        id: makeId(),
        title: input.title ?? "",
        content: input.content ?? "",
        pinned: false,
        courseId: input.courseId ?? null,
        eventId: input.eventId ?? null,
        assignmentId: input.assignmentId ?? null,
        projectId: input.projectId ?? null,
        coverAttachmentId: null,
        createdAt: todayISO(),
        updatedAt: now
      };
      const ok = await addNote(note);
      return ok ? note : null;
    },
    [addNote]
  );

  /** The note for one class session: the existing one, or a fresh one from the class template. */
  const sessionNote = useCallback(
    async (session: ScheduleEvent): Promise<Note | null> => {
      const existing = notes.find((n) => n.eventId === session.id);
      if (existing) return existing;
      // A second tap before the first insert lands must not create a twin.
      const pending = inflightSessionNotes.get(session.id);
      if (pending) return pending;
      const tpl = NOTE_TEMPLATES.find((t) => t.id === "class");
      const applied = tpl ? applyTemplate(tpl, formatWithWeekday(session.date)) : { title: "", content: "" };
      const p = createNote({ ...applied, courseId: session.courseId, eventId: session.id }).finally(() => inflightSessionNotes.delete(session.id));
      inflightSessionNotes.set(session.id, p);
      return p;
    },
    [notes, createNote]
  );

  const snapshot = useCallback(async (id: string, title: string, content: string, debounceSeconds = 60) => {
    try {
      await supabase.rpc("snapshot_note", {
        p_note_id: id,
        p_title: title,
        p_content: content,
        p_debounce_seconds: debounceSeconds
      });
    } catch {
      /* history is a convenience; the note itself is already saved */
    }
  }, []);

  /** Persists title + content; throws when the server refused (the editor keeps its dirty state). */
  const saveNote = useCallback(
    async (id: string, data: { title: string; content: string }, debounceSeconds = 60) => {
      const ok = await updateNote(id, { ...data, updatedAt: new Date().toISOString() });
      if (!ok) throw new Error("save_failed");
      void snapshot(id, data.title, data.content, debounceSeconds);
    },
    [updateNote, snapshot]
  );

  /* Keeps the pre-restore text as its own version, then saves the
     restored one as another. Both snapshots run without the debounce:
     otherwise the second would collapse into (and overwrite) the first. */
  const restoreNote = useCallback(
    async (id: string, current: { title: string; content: string }, restored: { title: string; content: string }) => {
      await snapshot(id, current.title, current.content, 0);
      await saveNote(id, restored, 0);
    },
    [snapshot, saveNote]
  );

  const togglePin = useCallback(
    (id: string) => {
      const note = notes.find((n) => n.id === id);
      if (!note) return Promise.resolve(false);
      return updateNote(id, { pinned: !note.pinned });
    },
    [notes, updateNote]
  );

  const linkNote = useCallback(
    (id: string, links: NoteLinks) =>
      updateNote(id, {
        courseId: links.courseId ?? null,
        eventId: links.eventId ?? null,
        assignmentId: links.assignmentId ?? null,
        projectId: links.projectId ?? null
      }),
    [updateNote]
  );

  const upsertTag = useCallback(
    async (label: string): Promise<NoteTag | null> => {
      const clean = label.trim();
      if (!clean) return null;
      const existing = noteTags.find((t) => t.label.toLowerCase() === clean.toLowerCase());
      if (existing) return existing;
      const tag: NoteTag = { id: makeId(), label: clean, color: "accent", createdAt: todayISO() };
      const ok = await addNoteTag(tag);
      /* The store may have converged on a twin another device made first
         (labels are unique, case-insensitively); the row that survived is
         the one to link, whatever id we minted. */
      return ok ? (findNoteTagByLabel(clean) ?? tag) : findNoteTagByLabel(clean);
    },
    [noteTags, addNoteTag, findNoteTagByLabel]
  );

  const linkTag = useCallback(
    async (noteId: string, tagId: string) => {
      if (noteTagLinks.some((l) => l.noteId === noteId && l.tagId === tagId)) return true;
      return addNoteTagLink({ id: makeId(), noteId, tagId, createdAt: todayISO() });
    },
    [noteTagLinks, addNoteTagLink]
  );

  const unlinkTag = useCallback(
    async (noteId: string, tagId: string) => {
      const link = noteTagLinks.find((l) => l.noteId === noteId && l.tagId === tagId);
      if (link) await removeNoteTagLink(link.id);
    },
    [noteTagLinks, removeNoteTagLink]
  );

  // The rows cascade with the note; the bytes in R2 don't, so purge
  // them first (best-effort — an orphaned object is recoverable).
  const purgeAttachments = useCallback(
    async (ids: string[]) => {
      const gone = new Set(ids);
      await Promise.all(noteAttachments.filter((a) => gone.has(a.noteId)).map((a) => deleteFile(a.r2Path).catch(() => false)));
    },
    [noteAttachments]
  );
  const deleteNote = useCallback(
    async (id: string) => {
      await purgeAttachments([id]);
      await removeNote(id);
    },
    [purgeAttachments, removeNote]
  );
  const deleteNotes = useCallback(
    async (ids: string[]) => {
      await purgeAttachments(ids);
      await removeNotes(ids);
    },
    [purgeAttachments, removeNotes]
  );

  const tagsByNote = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of noteTagLinks) {
      let set = m.get(l.noteId);
      if (!set) {
        set = new Set();
        m.set(l.noteId, set);
      }
      set.add(l.tagId);
    }
    return m;
  }, [noteTagLinks]);

  /** Server full-text search (Spanish stemming); ids ranked best first. Falls back to [] on error. */
  const searchNotes = useCallback(
    async (query: string): Promise<string[]> => {
      const { data, error } = await supabase.rpc("search_notes", { p_workspace_id: workspaceId, p_query: query, p_limit: 50 });
      if (error || !data) return [];
      return (data as { id: string }[]).map((r) => r.id);
    },
    [workspaceId]
  );

  const loadVersions = useCallback(async (noteId: string): Promise<NoteVersion[] | null> => {
    const { data, error } = await supabase
      .from("note_versions")
      .select("id, note_id, version_no, title, content, created_at")
      .eq("note_id", noteId)
      .order("version_no", { ascending: false });
    if (error || !data) return null;
    return data.map((v) => ({
      id: v.id as string,
      noteId: v.note_id as string,
      versionNo: v.version_no as number,
      title: (v.title as string) ?? "",
      content: (v.content as string) ?? "",
      createdAt: v.created_at as string
    }));
  }, []);

  return {
    notes,
    noteTags,
    noteTagLinks,
    tagsByNote,
    createNote,
    sessionNote,
    saveNote,
    restoreNote,
    togglePin,
    linkNote,
    deleteNote,
    deleteNotes,
    upsertTag,
    linkTag,
    unlinkTag,
    searchNotes,
    loadVersions
  };
}
