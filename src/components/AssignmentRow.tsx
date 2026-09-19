import type { Assignment } from "../types";
import { dueLabel } from "../utils/studies";
import { Icon } from "./Icon";
import { haptic } from "../lib/haptics";

/* ── AssignmentRow ──
   One tarea in a list: the check (44px target), title, due line and
   optional context (its course, its piece). Tapping the body opens it;
   tapping the check flips it. */
export function AssignmentRow({
  assignment,
  today,
  context,
  onOpen,
  onToggle
}: {
  assignment: Assignment;
  today: string;
  /** "Maestría · Boceto final" — whatever the surrounding list doesn't already say. */
  context?: string | null;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const done = assignment.status === "done";
  const due = dueLabel(assignment, today);
  return (
    <div className={`row-item row-item--static task-row ${done ? "task-row--done" : ""}`}>
      <button
        type="button"
        className="task-check-btn"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Reabrir ${assignment.title}` : `Marcar ${assignment.title} como entregada`}
        onClick={() => {
          haptic.tap();
          onToggle();
        }}
      >
        <span className={`task-check ${done ? "task-check--done" : ""}`}>
          <Icon name="check" size={14} strokeWidth={3} />
        </span>
      </button>
      <button
        type="button"
        className="row-content btn-tap"
        style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}
        onClick={onOpen}
      >
        <div className="row-title">{assignment.title}</div>
        <div className="row-sub">
          {done ? (
            <span>Entregada{assignment.grade ? ` · ${assignment.grade}` : ""}</span>
          ) : (
            <span className={`task-due ${due.tone === "overdue" ? "task-due--overdue" : due.tone === "today" ? "task-due--today" : ""}`}>{due.text}</span>
          )}
          {context ? ` · ${context}` : ""}
        </div>
      </button>
      <span className="row-chevron" aria-hidden="true">
        <Icon name="chevron-right" size={16} />
      </span>
    </div>
  );
}
