import { useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { Assignment, AssignmentStatus } from "../types";
import { ASSIGNMENT_STATUS } from "../data/constants";
import { Sheet } from "./Sheet";
import { SheetActions } from "./SheetActions";
import { SegmentedControl } from "./SegmentedControl";
import { PickerField } from "./PickerField";
import { ProjectSheet } from "./ProjectSheet";
import { makeId } from "../utils/id";
import { todayISO } from "../utils/dates";
import { taskProgress } from "../utils/studies";
import { useNotes } from "../hooks/useNotes";
import { NoteEditor } from "./NoteEditor";
import { Icon } from "./Icon";
import type { Note } from "../types";
import { haptic } from "../lib/haptics";

const STATUS_ITEMS = ASSIGNMENT_STATUS.map((s) => ({ k: s.value, l: s.label }));

/* ── AssignmentSheet ──
   A tarea: what the course asked for, when it's due, how far along
   she is, and the piece she made for it. Marking it Entregada opens
   the grade / feedback fields. The description is plain markdown for
   now (task lines count as steps); the rich editor lands with Notas. */
export function AssignmentSheet({
  assignment,
  initialCourseId,
  initialDueDate,
  onClose,
  onDeleted
}: {
  assignment: Assignment | null;
  initialCourseId?: string;
  initialDueDate?: string;
  onClose: () => void;
  /** Called instead of onClose after a delete, so a detail sheet underneath can react. */
  onDeleted?: () => void;
}) {
  const { courses, projects, addAssignment, updateAssignment, removeAssignment } = useApp();
  const { showSuccess } = useToast();
  const [title, setTitle] = useState(assignment?.title ?? "");
  const [courseId, setCourseId] = useState(assignment?.courseId ?? initialCourseId ?? "");
  const [dueDate, setDueDate] = useState(assignment?.dueDate ?? initialDueDate ?? "");
  const [dueTime, setDueTime] = useState(assignment?.dueTime ?? "");
  const [status, setStatus] = useState<AssignmentStatus>(assignment?.status ?? "todo");
  const [description, setDescription] = useState(assignment?.description ?? "");
  const [projectId, setProjectId] = useState(assignment?.projectId ?? "");
  const [grade, setGrade] = useState(assignment?.grade ?? "");
  const [feedback, setFeedback] = useState(assignment?.feedback ?? "");
  const [newProject, setNewProject] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [noteOpen, setNoteOpen] = useState<Note | null>(null);
  const { notes, createNote } = useNotes();
  const linkedNotes = assignment ? notes.filter((n) => n.assignmentId === assignment.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [];

  const safeClose = submitting ? null : onClose;
  const courseOptions = courses
    .filter((c) => c.status === "active" || c.status === "upcoming" || c.id === courseId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: c.name }));
  const projectOptions = [
    { value: "__new__", label: "+ Nueva pieza para esta tarea" },
    ...[...projects].sort((a, b) => a.title.localeCompare(b.title)).map((p) => ({ value: p.id, label: p.title }))
  ];
  const steps = taskProgress(description);
  const canSave = title.trim().length > 0 && courseId !== "";

  function handleSave() {
    if (!canSave) return;
    setSubmitting(true);
    const today = todayISO();
    const patch = {
      courseId,
      title: title.trim(),
      description: description.trim(),
      dueDate: dueDate || null,
      dueTime: dueDate && dueTime ? dueTime : null,
      status,
      completedAt: status === "done" ? (assignment?.completedAt ?? today) : null,
      projectId: projectId || null,
      grade: grade.trim(),
      feedback: feedback.trim()
    };
    if (assignment) {
      void updateAssignment(assignment.id, patch);
    } else {
      void addAssignment({ id: makeId(), createdAt: today, ...patch });
    }
    haptic.success();
    showSuccess(assignment ? "Tarea actualizada" : status === "done" ? "Tarea entregada" : "Tarea creada");
    onClose();
  }

  function handleDelete() {
    if (!assignment) return;
    void removeAssignment(assignment.id);
    haptic.warn();
    showSuccess("Tarea eliminada");
    (onDeleted ?? onClose)();
  }

  return (
    <>
      <Sheet
        title={assignment ? "Editar tarea" : "Nueva tarea"}
        onClose={safeClose}
        footer={
          <SheetActions
            canSave={canSave}
            submitting={submitting}
            onSave={handleSave}
            onDelete={assignment ? handleDelete : undefined}
            confirmText="¿Eliminar esta tarea? La pieza ligada se conserva."
          />
        }
      >
        <div className="input-group">
          <label className="input-label" htmlFor="tarea-title">Qué hay que entregar</label>
          <input
            id="tarea-title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Boceto final, ensayo, serie de 3 piezas…"
            autoFocus={assignment === null}
          />
        </div>

        <div className="input-group">
          <span className="input-label">Curso</span>
          {courseOptions.length > 0 ? (
            <PickerField title="Curso" options={courseOptions} value={courseId} onChange={setCourseId} />
          ) : (
            <div className="input-help">Primero agrega el curso en Estudios; las tareas viven dentro de él.</div>
          )}
        </div>

        <div className="form-row">
          <div className="input-group">
            <label className="input-label" htmlFor="tarea-due">Fecha de entrega</label>
            <input id="tarea-due" className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="tarea-time">Hora</label>
            <input id="tarea-time" className="input" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} disabled={!dueDate} />
          </div>
        </div>

        <div className="input-group">
          <span className="input-label">Estado</span>
          <SegmentedControl
            items={STATUS_ITEMS}
            value={status}
            onChange={(k) => setStatus(k as AssignmentStatus)}
            size="sm"
            role="radiogroup"
            ariaLabel="Estado de la tarea"
          />
        </div>

        <div className="input-group">
          <label className="input-label" htmlFor="tarea-desc">Detalles y pasos</label>
          <textarea
            id="tarea-desc"
            className="input"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={"Qué pidió el maestro, medidas, referencias…\n- [ ] un paso por línea"}
          />
          <div className="input-help">
            {steps.total > 0
              ? `${steps.done} de ${steps.total} ${steps.total === 1 ? "paso listo" : "pasos listos"}`
              : "Escribe “- [ ] paso” para llevar pasos; se marcan con “[x]”."}
          </div>
        </div>

        <div className="input-group">
          <span className="input-label">Pieza para esta tarea</span>
          <PickerField
            title="Pieza"
            options={projectOptions}
            value={projectId}
            onChange={(v) => (v === "__new__" ? setNewProject(true) : setProjectId(v))}
          />
        </div>

        {assignment && (
          <div className="input-group">
            <span className="input-label">Notas de esta tarea</span>
            <div className="money-list">
              {linkedNotes.map((n) => (
                <button key={n.id} type="button" className="row-item" style={{ minHeight: 48 }} onClick={() => setNoteOpen(n)}>
                  <div className="row-content">
                    <div className="row-title" style={{ fontWeight: 600 }}>{n.title || "Sin título"}</div>
                  </div>
                  <span className="row-chevron" aria-hidden="true">
                    <Icon name="chevron-right" size={16} />
                  </span>
                </button>
              ))}
              <button
                type="button"
                className="row-item"
                style={{ minHeight: 48 }}
                onClick={async () => {
                  const created = await createNote({ courseId: assignment.courseId, assignmentId: assignment.id, title: `Notas · ${assignment.title}` });
                  if (created) setNoteOpen(created);
                }}
              >
                <div className="row-content">
                  <div className="row-title" style={{ color: "var(--accent-dark)", fontWeight: 700 }}>+ Nueva nota</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {status === "done" && (
          <>
            <div className="input-group">
              <label className="input-label" htmlFor="tarea-grade">Calificación</label>
              <input id="tarea-grade" className="input" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="10, A, aprobada…" />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="tarea-feedback">Retroalimentación</label>
              <textarea id="tarea-feedback" className="input" rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Qué te dijeron de la entrega" />
            </div>
          </>
        )}
      </Sheet>

      {noteOpen && <NoteEditor key={noteOpen.id} note={noteOpen} onClose={() => setNoteOpen(null)} />}
      {newProject && (
        <ProjectSheet
          project={null}
          initialTitle={title.trim()}
          initialCourseId={courseId || undefined}
          onCreated={(id) => {
            setProjectId(id);
            setNewProject(false);
          }}
          onClose={() => setNewProject(false)}
        />
      )}
    </>
  );
}
