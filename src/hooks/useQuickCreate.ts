import { useCallback, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { ContactRelationship } from "../types";
import {
  findByName,
  quickAssignment,
  quickContact,
  quickCourse,
  quickExpo,
  quickProject,
  usableName,
  type QuickProjectOptions
} from "../utils/quickCreate";
import { makeId } from "../utils/id";
import { todayISO } from "../utils/dates";
import { haptic } from "../lib/haptics";

/* The picker-side of utils/quickCreate.ts: stamps the row, writes it
   through the same optimistic store every sheet uses, and answers with
   the new id so the field can select it — or null when the server said
   no (the store has already reverted and shown why). A name that already
   exists answers with THAT row's id instead of making a twin: there is no
   unique index on names, so this is the duplicate guard. One short toast
   per creation, so she knows a real row now exists somewhere she can
   finish later. */
export function useQuickCreate() {
  const { contacts, projects, events, courses, assignments, addContact, addProject, addEvent, addCourse, addAssignment } =
    useApp();
  const { showSuccess } = useToast();

  const stamp = () => ({ id: makeId(), createdAt: todayISO() });

  const contact = useCallback(
    async (typed: string, relationship: ContactRelationship): Promise<string | null> => {
      if (!usableName(typed)) return null;
      const existing = findByName(contacts, typed, (c) => c.name);
      if (existing) return existing.id;
      const row = quickContact(typed, relationship, stamp());
      if (!(await addContact(row))) return null;
      haptic.success();
      showSuccess(`${row.name} ya está en tus contactos`);
      return row.id;
    },
    [contacts, addContact, showSuccess]
  );

  const project = useCallback(
    async (typed: string, opts: QuickProjectOptions = {}): Promise<string | null> => {
      if (!usableName(typed)) return null;
      const existing = findByName(projects, typed, (p) => p.title);
      if (existing) return existing.id;
      const row = quickProject(typed, opts, stamp());
      if (!(await addProject(row))) return null;
      haptic.success();
      showSuccess("Pieza creada · complétala cuando quieras desde Obra");
      return row.id;
    },
    [projects, addProject, showSuccess]
  );

  const expo = useCallback(
    async (typed: string, date: string): Promise<string | null> => {
      if (!usableName(typed)) return null;
      const existing = findByName(
        events.filter((e) => e.kind === "expo"),
        typed,
        (e) => e.title
      );
      if (existing) return existing.id;
      const row = quickExpo(typed, date || todayISO(), stamp());
      if (!(await addEvent(row))) return null;
      haptic.success();
      showSuccess("Expo agendada · ponle presupuesto desde Expos");
      return row.id;
    },
    [events, addEvent, showSuccess]
  );

  const course = useCallback(
    async (typed: string, opts: { startDate?: string | null } = {}): Promise<string | null> => {
      if (!usableName(typed)) return null;
      const existing = findByName(courses, typed, (c) => c.name);
      if (existing) return existing.id;
      const row = quickCourse(typed, opts, stamp());
      if (!(await addCourse(row))) return null;
      haptic.success();
      showSuccess("Curso creado en Estudios");
      return row.id;
    },
    [courses, addCourse, showSuccess]
  );

  const assignment = useCallback(
    async (typed: string, courseId: string): Promise<string | null> => {
      if (!usableName(typed) || !courseId) return null;
      const existing = findByName(
        assignments.filter((a) => a.courseId === courseId),
        typed,
        (a) => a.title
      );
      if (existing) return existing.id;
      const row = quickAssignment(typed, courseId, stamp());
      if (!(await addAssignment(row))) return null;
      haptic.success();
      showSuccess("Tarea creada");
      return row.id;
    },
    [assignments, addAssignment, showSuccess]
  );

  return useMemo(
    () => ({ contact, project, expo, course, assignment }),
    [contact, project, expo, course, assignment]
  );
}
