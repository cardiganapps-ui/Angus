import { useMemo, useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import type { Course } from "../types";
import { COURSE_KIND, COURSE_KIND_BADGE, labelFor } from "../data/constants";
import { courseCost, courseSessions, coursesByStatus, nextSession } from "../utils/studies";
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
  const { courses, events, expenses } = useApp();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const today = todayISO();

  const buckets = useMemo(() => coursesByStatus(courses, today), [courses, today]);
  const weekEnd = addDays(today, 6);
  const sessionsThisWeek = useMemo(
    () => events.filter((e) => !e.cancelled && e.courseId !== null && e.date >= today && e.date <= weekEnd).length,
    [events, today, weekEnd]
  );
  const activeCount = buckets.active.length + buckets.upcoming.length;

  const row = (course: Course, i: number) => {
    const sessions = courseSessions(course, events);
    const next = nextSession(sessions, today);
    const cost = courseCost(course, expenses, sessions);
    return (
      <button key={course.id} type="button" className="row-item list-entry-stagger" style={stagger(i)} onClick={() => setOpen(course.id)}>
        <div className="row-content">
          <div className="row-title">{course.name}</div>
          <div className="row-sub">
            {course.institution ? `${course.institution} · ` : ""}
            {next ? `Próxima ${formatWithWeekday(next.date)}${next.startTime ? ` ${next.startTime}` : ""}` : "Sin sesiones próximas"}
          </div>
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
        </div>
        <h1 className="page-title">Estudios</h1>
      </div>

      {courses.length === 0 ? (
        <div className="section">
          <div className="card">
            <EmptyState
              icon="book"
              title="Sin cursos todavía"
              body="Agrega la clase, taller o maestría que estás tomando. Angus agenda las sesiones, lleva lo que has pagado y, pronto, tus tareas y apuntes."
            />
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
