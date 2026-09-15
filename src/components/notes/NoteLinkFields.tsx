import { useApp } from "../../context/AppContext";
import type { NoteLinks } from "../../hooks/useNotes";
import { PickerField } from "../PickerField";
import { courseSessions, sortAssignments } from "../../utils/studies";
import { formatWithWeekday } from "../../utils/dates";

/* ── NoteLinkFields ──
   Where a note belongs: a course, one of its sessions, one of its
   tareas, and/or a piece. Changing the course drops a session or
   tarea that no longer fits. Shared by the editor's link sheet and
   the list's properties sheet. */
export function NoteLinkFields({ value, onChange }: { value: NoteLinks; onChange: (next: NoteLinks) => void }) {
  const { courses, events, assignments, projects } = useApp();
  const courseId = value.courseId ?? "";
  const course = courses.find((c) => c.id === courseId) ?? null;

  const courseOptions = courses
    .filter((c) => c.status === "active" || c.status === "upcoming" || c.id === courseId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: c.name }));
  const sessionOptions = course
    ? courseSessions(course, events)
        .slice()
        .reverse()
        .map((s) => ({ value: s.id, label: `${formatWithWeekday(s.date)}${s.startTime ? ` · ${s.startTime}` : ""}` }))
    : [];
  const tareaOptions = course
    ? sortAssignments(assignments.filter((a) => a.courseId === course.id)).map((a) => ({ value: a.id, label: a.title }))
    : [];
  const projectOptions = [...projects].sort((a, b) => a.title.localeCompare(b.title)).map((p) => ({ value: p.id, label: p.title }));

  return (
    <>
      <div className="input-group">
        <span className="input-label">Curso</span>
        {courseOptions.length > 0 ? (
          <PickerField
            title="Curso"
            options={courseOptions}
            value={courseId}
            onChange={(v) => onChange({ ...value, courseId: v || null, eventId: null, assignmentId: null })}
          />
        ) : (
          <div className="input-help">Agrega un curso en Estudios para ligar apuntes a sus sesiones y tareas.</div>
        )}
      </div>
      {course && sessionOptions.length > 0 && (
        <div className="input-group">
          <span className="input-label">Sesión</span>
          <PickerField title="Sesión" options={sessionOptions} value={value.eventId ?? ""} onChange={(v) => onChange({ ...value, eventId: v || null })} />
        </div>
      )}
      {course && tareaOptions.length > 0 && (
        <div className="input-group">
          <span className="input-label">Tarea</span>
          <PickerField title="Tarea" options={tareaOptions} value={value.assignmentId ?? ""} onChange={(v) => onChange({ ...value, assignmentId: v || null })} />
        </div>
      )}
      {projectOptions.length > 0 && (
        <div className="input-group">
          <span className="input-label">Pieza</span>
          <PickerField title="Pieza" options={projectOptions} value={value.projectId ?? ""} onChange={(v) => onChange({ ...value, projectId: v || null })} />
        </div>
      )}
    </>
  );
}
