import { useMemo, useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import type { Course, CourseKind } from "../types";
import { COURSE_KIND, COURSE_KIND_BADGE, labelFor } from "../data/constants";
import { SearchField } from "../components/SearchField";
import { matches } from "../utils/text";
import { haptic } from "../lib/haptics";
import { courseCost, courseSessions, courseTareas, coursesByStatus, dueAssignments, nextSession } from "../utils/studies";
import { formatMXNShort } from "../utils/money";
import { addDays, formatWithWeekday, todayISO } from "../utils/dates";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { CourseSheet } from "../components/CourseSheet";
import { CourseDetailSheet } from "../components/CourseDetailSheet";

const stagger = (i: number) => ({ "--stagger-i": Math.min(i, 12) }) as CSSProperties;

/* ── Estudios ──
   The courses she takes, at a glance: what's next, what each one has
   cost her, and (from Stage 2) what she owes them in tareas. */
export function Studies() {
  const { courses, events, expenses, assignments } = useApp();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | CourseKind>("all");
  const today = todayISO();

  const filtered = useMemo(() => {
    let list = courses;
    if (query.trim()) list = list.filter((c) => matches(`${c.name} ${c.institution} ${c.location}`, query));
    if (kind !== "all") list = list.filter((c) => c.kind === kind);
    return list;
  }, [courses, query, kind]);
  const filtering = query.trim() !== "" || kind !== "all";
  const buckets = useMemo(() => coursesByStatus(filtered, today), [filtered, today]);
  const kindsInUse = useMemo(() => COURSE_KIND.filter((k) => courses.some((c) => c.kind === k.value)), [courses]);
  const weekEnd = addDays(today, 6);
  const sessionsThisWeek = useMemo(
    () => events.filter((e) => !e.cancelled && e.courseId !== null && e.date >= today && e.date <= weekEnd).length,
    [events, today, weekEnd]
  );
  const due = useMemo(() => dueAssignments(assignments, today), [assignments, today]);
  const entregasSemana = due.overdue.length + due.today.length + due.soon.length;
  const activeCount = buckets.active.length + buckets.upcoming.length;

  const row = (course: Course, i: number) => {
    const sessions = courseSessions(course, events);
    const next = nextSession(sessions, today);
    const cost = courseCost(course, expenses, sessions);
    const tareas = courseTareas(assignments.filter((a) => a.courseId === course.id), today);
    return (
      <button key={course.id} type="button" className="row-item list-entry-stagger" style={stagger(i)} onClick={() => setOpen(course.id)}>
        <div className="row-content">
          <div className="row-title">{course.name}</div>
          <div className="row-sub">
            {course.institution ? `${course.institution} · ` : ""}
            {next ? `Próxima ${formatWithWeekday(next.date)}${next.startTime ? ` ${next.startTime}` : ""}` : "Sin sesiones próximas"}
          </div>
          {tareas.pending > 0 && (
            <div className="row-sub">
              {tareas.pending} {tareas.pending === 1 ? "tarea pendiente" : "tareas pendientes"}
              {tareas.overdue > 0 ? (
                <span className="task-due task-due--overdue"> · {tareas.overdue} {tareas.overdue === 1 ? "vencida" : "vencidas"}</span>
              ) : tareas.dueToday > 0 ? (
                <span className="task-due task-due--today"> · {tareas.dueToday === 1 ? "una vence hoy" : `${tareas.dueToday} vencen hoy`}</span>
              ) : null}
            </div>
          )}
          {course.paymentPlan !== "free" && (cost.paid > 0 || cost.total) ? (
            <div className="row-sub">
              {formatMXNShort(cost.paid)} pagados
              {cost.total !== null && cost.total > 0 ? ` de ${formatMXNShort(cost.total)}` : ""}
            </div>
          ) : null}
        </div>
        <span className={`badge ${COURSE_KIND_BADGE[course.kind]}`}>{labelFor(COURSE_KIND, course.kind)}</span>
        <span className="row-chevron" aria-hidden="true">
          <Icon name="chevron-right" size={16} />
        </span>
      </button>
    );
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">
          {activeCount} {activeCount === 1 ? "curso" : "cursos"}
          {sessionsThisWeek > 0 ? ` · ${sessionsThisWeek} ${sessionsThisWeek === 1 ? "sesión" : "sesiones"} esta semana` : ""}
          {entregasSemana > 0 ? ` · ${entregasSemana} ${entregasSemana === 1 ? "entrega" : "entregas"}` : ""}
        </div>
        <h1 className="page-title">Estudios</h1>
      </div>

      {courses.length > 2 && (
        <>
          <SearchField value={query} onChange={setQuery} placeholder="Buscar curso o escuela…" ariaLabel="Buscar cursos" />
          {kindsInUse.length > 1 && (
            <div className="filter-row" role="group" aria-label="Filtrar por tipo">
              <FilterChip active={kind === "all"} onClick={() => setKind("all")}>Todos</FilterChip>
              {kindsInUse.map((k) => (
                <FilterChip key={k.value} active={kind === k.value} onClick={() => setKind(k.value)}>
                  {k.label}
                </FilterChip>
              ))}
            </div>
          )}
        </>
      )}

      {courses.length === 0 ? (
        <div className="section">
          <div className="card">
            <EmptyState
              icon="book"
              title="Sin cursos todavía"
              body="Agrega la clase, taller o maestría que estás tomando. Angus agenda las sesiones, te recuerda las entregas y lleva lo que has pagado."
              actionLabel="Agregar curso"
              onAction={() => setCreating(true)}
            />
          </div>
        </div>
      ) : filtered.length === 0 && filtering ? (
        <div className="section">
          <div className="card">
            <EmptyState icon="search" title="Nada coincide" body="Prueba con otra palabra o quita el filtro." />
          </div>
        </div>
      ) : (
        <>
          {buckets.active.length > 0 && (
            <div className="section">
              <div className="section-header">
                <span className="section-title">En curso</span>
              </div>
              <div className="card">{buckets.active.map(row)}</div>
            </div>
          )}
          {buckets.upcoming.length > 0 && (
            <div className="section">
              <div className="section-header">
                <span className="section-title">Próximos</span>
              </div>
              <div className="card">{buckets.upcoming.map(row)}</div>
            </div>
          )}
          {buckets.past.length > 0 && (
            <div className="section">
              <div className="section-header">
                <span className="section-title">Terminados</span>
              </div>
              <div className="card">{buckets.past.map(row)}</div>
            </div>
          )}
        </>
      )}

      <button className="fab" onClick={() => setCreating(true)} aria-label="Nuevo curso">
        <Icon name="plus" size={24} strokeWidth={2.2} />
      </button>

      {creating && <CourseSheet course={null} onClose={() => setCreating(false)} />}
      {open && <CourseDetailSheet courseId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={`chip ${active ? "active" : ""}`}
      aria-pressed={active}
      onClick={() => {
        haptic.tap();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
