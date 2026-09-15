import { useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { Assignment, Course, Expense, Note, ScheduleEvent } from "../types";
import { COURSE_KIND, COURSE_KIND_BADGE, COURSE_MODALITY, COURSE_PAYMENT_PLAN, COURSE_STATUS, COURSE_STATUS_BADGE, EXPENSE_CATEGORY, labelFor } from "../data/constants";
import { assignmentProgress, courseCost, courseSessions, courseTimeline, dueAssignments, nextSession } from "../utils/studies";
import { describeSeries } from "../utils/series";
import { formatMXN, formatMXNShort } from "../utils/money";
import { formatShort, formatWithWeekday, relativeDayLabel, daysUntil, todayISO } from "../utils/dates";
import { Sheet } from "./Sheet";
import { Icon } from "./Icon";
import { SegmentedControl } from "./SegmentedControl";
import { ProgressRing } from "./ProgressRing";
import { CourseSheet } from "./CourseSheet";
import { EventSheet } from "./EventSheet";
import { ExpenseSheet } from "./ExpenseSheet";
import { AssignmentSheet } from "./AssignmentSheet";
import { AssignmentRow } from "./AssignmentRow";
import { NoteEditor } from "./NoteEditor";
import { useNotes } from "../hooks/useNotes";
import { NOTE_TEMPLATES, applyTemplate } from "../data/noteTemplates";
import { notePreview, relativeTime } from "../utils/noteText";
import { haptic } from "../lib/haptics";

type Tab = "summary" | "sessions" | "tareas" | "notes" | "expenses";
const TAB_ITEMS = [
  { k: "summary", l: "Resumen" },
  { k: "sessions", l: "Sesiones" },
  { k: "tareas", l: "Tareas" },
  { k: "notes", l: "Notas" },
  { k: "expenses", l: "Gastos" }
];

/* ── CourseDetailSheet ──
   One course she takes: what it is, when it meets (with "Falté" per
   session), and what it has cost her. Tareas, Notas and Material tabs
   join in later stages. */
export function CourseDetailSheet({ courseId, initialTab = "summary", onClose }: { courseId: string; initialTab?: Tab; onClose: () => void }) {
  const { courses, events, expenses, rules, contacts, series, projects, assignments, updateEvent, updateAssignment } = useApp();
  const { showSuccess } = useToast();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [editing, setEditing] = useState(false);
  const [session, setSession] = useState<ScheduleEvent | null | "new">(null);
  const [expense, setExpense] = useState<Expense | null | "new">(null);
  const [tarea, setTarea] = useState<Assignment | null | "new">(null);
  const [noteOpen, setNoteOpen] = useState<Note | null>(null);
  const { notes, createNote } = useNotes();
  const closeRef = useRef<(() => void) | null>(null);
  const today = todayISO();

  const live = courses.find((c) => c.id === courseId) ?? null;
  const last = useRef<Course | null>(live);
  if (live) last.current = live;
  const course = live ?? last.current;

  const sessions = useMemo(() => (course ? courseSessions(course, events) : []), [course, events]);
  const linkedExpenses = useMemo(
    () => expenses.filter((e) => e.courseId === courseId).sort((a, b) => b.date.localeCompare(a.date)),
    [expenses, courseId]
  );
  const courseTareas = useMemo(() => assignments.filter((a) => a.courseId === courseId), [assignments, courseId]);
  const courseNotes = useMemo(
    () => notes.filter((n) => n.courseId === courseId).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)),
    [notes, courseId]
  );
  if (!course) return null;

  // "Apuntes" on a session: open its note, or start one from the class template.
  async function openSessionNote(s: ScheduleEvent) {
    if (!course) return;
    const existing = notes.find((n) => n.eventId === s.id);
    if (existing) {
      setNoteOpen(existing);
      return;
    }
    const tpl = NOTE_TEMPLATES.find((t) => t.id === "class");
    const applied = tpl ? applyTemplate(tpl, formatWithWeekday(s.date)) : { title: "", content: "" };
    const created = await createNote({ ...applied, courseId: course.id, eventId: s.id });
    if (created) setNoteOpen(created);
  }
  async function newCourseNote() {
    if (!course) return;
    const created = await createNote({ courseId: course.id });
    if (created) setNoteOpen(created);
  }

  const tareas = dueAssignments(courseTareas, today);
  const progress = assignmentProgress(courseTareas);
  const openTareas = [...tareas.overdue, ...tareas.today, ...tareas.soon, ...tareas.later, ...tareas.undated];
  const doneTareas = courseTareas
    .filter((a) => a.status === "done")
    .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt));
  const projectTitle = (id: string | null) => (id ? (projects.find((p) => p.id === id)?.title ?? null) : null);

  function toggleTarea(a: Assignment) {
    const done = a.status === "done";
    if (!done) haptic.success();
    void updateAssignment(a.id, { status: done ? "todo" : "done", completedAt: done ? null : today });
    showSuccess(done ? "Tarea reabierta" : "Tarea entregada");
  }

  const next = nextSession(sessions, today);
  const timeline = courseTimeline(sessions, today);
  const cost = courseCost(course, expenses, sessions);
  const parent = course.seriesId ? (series.find((s) => s.id === course.seriesId) ?? null) : null;
  const rule = course.recurringRuleId ? (rules.find((r) => r.id === course.recurringRuleId) ?? null) : null;
  const teacher = course.teacherContactId ? (contacts.find((c) => c.id === course.teacherContactId) ?? null) : null;
  const costRatio = cost.total && cost.total > 0 ? Math.min(1, cost.paid / cost.total) : 0;

  function toggleMissed(s: ScheduleEvent) {
    haptic.tap();
    void updateEvent(s.id, { missed: !s.missed });
    showSuccess(s.missed ? "Sesión marcada como asistida" : "Marcada como falta");
  }

  const upcoming = sessions.filter((s) => s.date >= today);
  const past = sessions.filter((s) => s.date < today).reverse();

  return (
    <>
      <Sheet
        title={course.name}
        onClose={onClose}
        closeRef={closeRef}
        footer={
          <div className="sheet-actions">
            <div className="sheet-actions-state">
              {tab === "expenses" && course.paymentPlan !== "free" ? (
                <button type="button" className="btn btn-primary" onClick={() => setExpense("new")}>
                  Registrar pago
                </button>
              ) : tab === "tareas" ? (
                <button type="button" className="btn btn-primary" onClick={() => setTarea("new")}>
                  Nueva tarea
                </button>
              ) : tab === "notes" ? (
                <button type="button" className="btn btn-primary" onClick={() => void newCourseNote()}>
                  Nueva nota
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => setSession("new")}>
                  Agregar sesión
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
                Editar curso
              </button>
            </div>
          </div>
        }
      >
        <div className="money-badges" style={{ marginBottom: 10 }}>
          <span className={`badge ${COURSE_KIND_BADGE[course.kind]}`}>{labelFor(COURSE_KIND, course.kind)}</span>
          <span className={`badge ${COURSE_STATUS_BADGE[course.status]}`}>{labelFor(COURSE_STATUS, course.status)}</span>
        </div>
        <div className="money-submeta" style={{ marginBottom: 12 }}>
          {course.institution || labelFor(COURSE_MODALITY, course.modality)}
          {parent ? ` · ${describeSeries(parent)}` : ""}
          {next ? ` · próxima ${formatWithWeekday(next.date)}${next.startTime ? ` ${next.startTime}` : ""}` : ""}
        </div>

        <div className="money-panel">
          <div className="money-stats" style={{ marginBottom: 0 }}>
            <div>
              <div className="money-stat-label">Sesiones</div>
              <div className="money-stat-value">
                {timeline.done}
                {timeline.total ? ` / ${timeline.total}` : ""}
              </div>
            </div>
            <div>
              <div className="money-stat-label">Tareas</div>
              <div className={`money-stat-value ${tareas.overdue.length > 0 ? "money-stat-value--owed" : ""}`}>
                {progress.done}
                {progress.total ? ` / ${progress.total}` : ""}
              </div>
            </div>
            <div>
              <div className="money-stat-label">Pagado</div>
              <div className="money-stat-value money-stat-value--paid">
                {formatMXNShort(cost.paid)}
                {cost.total !== null && cost.total > 0 ? <span className="money-stat-of"> de {formatMXNShort(cost.total)}</span> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="course-tabs">
          <SegmentedControl items={TAB_ITEMS} value={tab} onChange={(k) => setTab(k as Tab)} size="sm" ariaLabel="Sección" />
        </div>

        {tab === "summary" && (
          <div className="money-list" style={{ marginTop: 14 }}>
            <SummaryRow label="Institución" value={course.institution || "—"} />
            <SummaryRow label="Maestro/a" value={teacher?.name ?? "—"} />
            <SummaryRow label="Modalidad" value={labelFor(COURSE_MODALITY, course.modality)} />
            {course.location && <SummaryRow label="Lugar" value={course.location} />}
            {course.url && (
              <a className="row-item" href={course.url} target="_blank" rel="noreferrer">
                <div className="row-content">
                  <div className="row-sub">Enlace</div>
                  <div className="row-title" style={{ color: "var(--accent-dark)" }}>{course.url.replace(/^https?:\/\//, "")}</div>
                </div>
                <span className="row-chevron" aria-hidden="true">
                  <Icon name="chevron-right" size={16} />
                </span>
              </a>
            )}
            <SummaryRow
              label="Fechas"
              value={
                course.startDate
                  ? `${formatShort(course.startDate)}${course.endDate ? ` → ${formatShort(course.endDate)}` : " → sin fecha de fin"}`
                  : "—"
              }
            />
            <SummaryRow
              label="Costo"
              value={
                course.paymentPlan === "free"
                  ? "Sin costo"
                  : `${labelFor(COURSE_PAYMENT_PLAN, course.paymentPlan)}${course.cost !== null ? ` · ${formatMXN(course.cost)}` : ""}`
              }
            />
            {course.notes && (
              <div className="row-item" style={{ cursor: "default" }}>
                <div className="row-content">
                  <div className="row-sub">Notas</div>
                  <div className="row-title" style={{ fontWeight: 500, whiteSpace: "pre-wrap" }}>{course.notes}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "sessions" && (
          <div className="money-list" style={{ marginTop: 14 }}>
            {sessions.length === 0 ? (
              <div className="money-list-empty">Sin sesiones todavía. Agrega una, o edita el curso para darle un horario fijo.</div>
            ) : (
              <>
                {upcoming.slice(0, 12).map((s) => (
                  <div key={s.id} className="row-item" style={{ cursor: "default" }}>
                    <button type="button" className="row-content btn-tap" style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }} onClick={() => setSession(s)}>
                      <div className="row-title">{formatWithWeekday(s.date)}</div>
                      <div className="row-sub">
                        {s.startTime ? `${s.startTime}${s.endTime ? `–${s.endTime}` : ""}` : "Sin hora"}
                        {s.location ? ` · ${s.location}` : ""}
                      </div>
                    </button>
                    <span className={`badge ${s.date === today ? "badge-teal" : "badge-gray"}`}>{relativeDayLabel(daysUntil(s.date))}</span>
                    <button type="button" className={`row-icon-btn btn-tap ${notes.some((n) => n.eventId === s.id) ? "row-icon-btn--on" : ""}`} onClick={() => void openSessionNote(s)} aria-label={`Apuntes de ${formatWithWeekday(s.date)}`}>
                      <Icon name="edit" size={16} strokeWidth={2.2} />
                    </button>
                  </div>
                ))}
                {past.length > 0 && (
                  <div className="money-sheet-section-title" style={{ padding: "12px 16px 4px" }}>
                    Pasadas
                  </div>
                )}
                {past.slice(0, 20).map((s) => (
                  <div key={s.id} className="row-item row-item--muted" style={{ cursor: "default" }}>
                    <button type="button" className="row-content btn-tap" style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }} onClick={() => setSession(s)}>
                      <div className="row-title">{formatWithWeekday(s.date)}</div>
                      <div className="row-sub">{s.startTime ?? ""}{s.missed ? " · no fuiste" : ""}{notes.some((n) => n.eventId === s.id) ? " · con apuntes" : ""}</div>
                    </button>
                    <button type="button" className={`row-icon-btn btn-tap ${notes.some((n) => n.eventId === s.id) ? "row-icon-btn--on" : ""}`} onClick={() => void openSessionNote(s)} aria-label={`Apuntes de ${formatWithWeekday(s.date)}`}>
                      <Icon name="edit" size={16} strokeWidth={2.2} />
                    </button>
                    <button
                      type="button"
                      className={`btn-mini ${s.missed ? "btn-mini--active" : ""}`}
                      aria-pressed={s.missed}
                      onClick={() => toggleMissed(s)}
                    >
                      {s.missed ? "Falté" : "Fui"}
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {tab === "tareas" && (
          <>
            {courseTareas.length > 0 && (
              <div className="money-panel tareas-head" style={{ marginTop: 14 }}>
                <ProgressRing
                  ratio={progress.ratio}
                  size={48}
                  stroke={5}
                  color={progress.ratio === 1 ? "var(--green)" : "var(--accent)"}
                  label={`Tareas entregadas: ${Math.round(progress.ratio * 100)} por ciento`}
                >
                  {Math.round(progress.ratio * 100)}%
                </ProgressRing>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row-title">
                    {progress.done} de {progress.total} {progress.total === 1 ? "entregada" : "entregadas"}
                  </div>
                  <div className="row-sub">
                    {tareas.overdue.length > 0
                      ? `${tareas.overdue.length} ${tareas.overdue.length === 1 ? "vencida" : "vencidas"}`
                      : tareas.today.length > 0
                        ? `${tareas.today.length} ${tareas.today.length === 1 ? "vence hoy" : "vencen hoy"}`
                        : tareas.soon.length > 0
                          ? `${tareas.soon.length} esta semana`
                          : progress.ratio === 1
                            ? "Todo entregado"
                            : "Nada urgente"}
                  </div>
                </div>
              </div>
            )}
            <div className="money-list" style={{ marginTop: 14 }}>
              {courseTareas.length === 0 ? (
                <div className="money-list-empty">
                  Sin tareas todavía. Anota lo que te pidieron con su fecha de entrega y aparecerá en Hoy y en la Agenda.
                </div>
              ) : (
                <>
                  {openTareas.map((a) => (
                    <AssignmentRow key={a.id} assignment={a} today={today} context={projectTitle(a.projectId)} onOpen={() => setTarea(a)} onToggle={() => toggleTarea(a)} />
                  ))}
                  {doneTareas.length > 0 && openTareas.length > 0 && (
                    <div className="money-sheet-section-title" style={{ padding: "12px 16px 4px" }}>
                      Entregadas
                    </div>
                  )}
                  {doneTareas.map((a) => (
                    <AssignmentRow key={a.id} assignment={a} today={today} context={projectTitle(a.projectId)} onOpen={() => setTarea(a)} onToggle={() => toggleTarea(a)} />
                  ))}
                </>
              )}
            </div>
          </>
        )}

        {tab === "notes" && (
          <div className="money-list" style={{ marginTop: 14 }}>
            {courseNotes.length === 0 ? (
              <div className="money-list-empty">Sin apuntes todavía. Escribe una nota aquí, o toca el lápiz de una sesión para empezar con la plantilla de clase.</div>
            ) : (
              courseNotes.map((n) => (
                <button key={n.id} type="button" className="row-item" onClick={() => setNoteOpen(n)}>
                  <div className="row-content">
                    <div className="row-title">
                      {n.pinned ? <Icon name="star" size={12} strokeWidth={2.6} /> : null}
                      {n.pinned ? " " : ""}
                      {n.title || "Sin título"}
                    </div>
                    <div className="row-sub">
                      {relativeTime(n.updatedAt)}
                      {n.eventId ? " · sesión" : n.assignmentId ? " · tarea" : ""}
                      {notePreview(n.content) ? ` · ${notePreview(n.content)}` : ""}
                    </div>
                  </div>
                  <span className="row-chevron" aria-hidden="true">
                    <Icon name="chevron-right" size={16} />
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {tab === "expenses" && (
          <>
            {course.paymentPlan !== "free" && (
              <div className="money-panel" style={{ marginTop: 14, display: "flex", gap: 14, alignItems: "center" }}>
                <ProgressRing ratio={costRatio} size={56} stroke={6} color={cost.remaining === 0 ? "var(--green)" : "var(--accent)"} label={`Pagado ${Math.round(costRatio * 100)} por ciento`}>
                  {cost.total ? `${Math.round(costRatio * 100)}%` : "—"}
                </ProgressRing>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row-title">
                    {cost.total !== null && cost.total > 0
                      ? cost.remaining === 0
                        ? "Pagado por completo"
                        : `Faltan ${formatMXN(cost.remaining ?? 0)}`
                      : `${formatMXN(cost.paid)} pagados`}
                  </div>
                  <div className="row-sub">
                    {labelFor(COURSE_PAYMENT_PLAN, course.paymentPlan)}
                    {course.cost !== null ? ` · ${formatMXN(course.cost)}` : ""}
                    {rule?.active ? " · se registra solo cada mes" : ""}
                  </div>
                </div>
              </div>
            )}
            <div className="money-list" style={{ marginTop: 14 }}>
              {linkedExpenses.length === 0 ? (
                <div className="money-list-empty">
                  {course.paymentPlan === "free" ? "Este curso no tiene costo." : "Nada registrado todavía. Cuando pagues, regístralo aquí y queda ligado al curso."}
                </div>
              ) : (
                linkedExpenses.map((e) => (
                  <button key={e.id} type="button" className="row-item" onClick={() => setExpense(e)}>
                    <div className="row-content">
                      <div className="row-title">{e.title}</div>
                      <div className="row-sub">
                        {formatShort(e.date)} · {labelFor(EXPENSE_CATEGORY, e.category)}
                        {e.recurringRuleId ? " · fijo" : ""}
                      </div>
                    </div>
                    <span className="row-amount">{formatMXN(e.amount)}</span>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </Sheet>

      {editing && (
        <CourseSheet
          course={course}
          onClose={() => setEditing(false)}
          onDeleted={() => {
            setEditing(false);
            (closeRef.current ?? onClose)();
          }}
        />
      )}
      {session && (
        <EventSheet
          event={session === "new" ? null : session}
          initialKind="class"
          initialTitle={course.name}
          initialCourseId={course.id}
          initialDate={today}
          onClose={() => setSession(null)}
        />
      )}
      {noteOpen && <NoteEditor key={noteOpen.id} note={noteOpen} onClose={() => setNoteOpen(null)} />}
      {tarea && (
        <AssignmentSheet
          assignment={tarea === "new" ? null : tarea}
          initialCourseId={course.id}
          onClose={() => setTarea(null)}
        />
      )}
      {expense && (
        <ExpenseSheet
          expense={expense === "new" ? null : expense}
          initialCourseId={course.id}
          initialTitle={course.paymentPlan === "monthly" ? `Colegiatura · ${course.name}` : `Pago · ${course.name}`}
          initialAmount={course.paymentPlan === "single" ? (cost.remaining ?? course.cost ?? null) : course.cost}
          onClose={() => setExpense(null)}
        />
      )}
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="row-item" style={{ cursor: "default", minHeight: 52 }}>
      <div className="row-content">
        <div className="row-sub">{label}</div>
        <div className="row-title" style={{ fontWeight: 600 }}>{value}</div>
      </div>
    </div>
  );
}
