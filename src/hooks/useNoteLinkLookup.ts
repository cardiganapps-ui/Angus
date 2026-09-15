import { useApp } from "../context/AppContext";
import type { Note } from "../types";
import { formatWithWeekday } from "../utils/dates";

export interface NoteLinkLookup {
  courseName: (id: string) => string | null;
  sessionLabel: (id: string) => string | null;
  tareaTitle: (id: string) => string | null;
  projectTitle: (id: string) => string | null;
}

/** Resolves a note's link ids to names; a stale id (the target was deleted) resolves to nothing. */
export function useNoteLinkLookup(): NoteLinkLookup {
  const { courses, events, assignments, projects } = useApp();
  return {
    courseName: (id) => courses.find((c) => c.id === id)?.name ?? null,
    sessionLabel: (id) => {
      const e = events.find((ev) => ev.id === id);
      return e ? `${formatWithWeekday(e.date)}${e.startTime ? ` ${e.startTime}` : ""}` : null;
    },
    tareaTitle: (id) => assignments.find((a) => a.id === id)?.title ?? null,
    projectTitle: (id) => projects.find((p) => p.id === id)?.title ?? null
  };
}

/** "Maestría · mar 15 sep · Boceto final" — the parts of what a note is linked to. */
export function describeNoteLinks(note: Pick<Note, "courseId" | "eventId" | "assignmentId" | "projectId">, lookup: NoteLinkLookup): string[] {
  const parts: string[] = [];
  const course = note.courseId ? lookup.courseName(note.courseId) : null;
  const session = note.eventId ? lookup.sessionLabel(note.eventId) : null;
  const tarea = note.assignmentId ? lookup.tareaTitle(note.assignmentId) : null;
  const project = note.projectId ? lookup.projectTitle(note.projectId) : null;
  if (course) parts.push(course);
  if (session) parts.push(session);
  if (tarea) parts.push(tarea);
  if (project) parts.push(project);
  return parts;
}
