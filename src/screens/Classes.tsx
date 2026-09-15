import { useMemo, useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import { activeEnrollments, groupOccupancy, groupSessions, sessionsWithoutAttendance, summarizeTuition, tuitionStatus } from "../utils/classes";
import { formatMXNShort, sumMoney } from "../utils/money";
import { formatWithWeekday, todayISO } from "../utils/dates";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { ClassGroupSheet } from "../components/ClassGroupSheet";
import { ClassGroupDetailSheet } from "../components/ClassGroupDetailSheet";

const stagger = (i: number) => ({ "--stagger-i": Math.min(i, 12) }) as CSSProperties;

/* ── Clases ──
   Her groups at a glance: next session, students vs cupo, who is
   behind on tuition, and whether a past session still needs its list. */
export function Classes() {
  const { groups, enrollments, attendance, events, rules, sales, payments } = useApp();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const today = todayISO();

  const rows = useMemo(
    () =>
      groups
        .filter((g) => g.active)
        .map((g) => {
          const sessions = groupSessions(g, events);
          const next = [...sessions].reverse().find((s) => s.date >= today) ?? null;
          const untaken = sessionsWithoutAttendance(sessions, attendance, today).length;
          const t = summarizeTuition(tuitionStatus(g, enrollments, rules, sales, payments, today, today));
          return { group: g, occupancy: groupOccupancy(g, enrollments, today), next, untaken, tuition: t };
        })
        .sort((a, b) => (a.next?.date ?? "9999").localeCompare(b.next?.date ?? "9999") || a.group.name.localeCompare(b.group.name)),
    [groups, events, attendance, enrollments, rules, sales, payments, today]
  );
  const students = new Set(groups.flatMap((g) => activeEnrollments(enrollments, g.id, today).map((e) => e.contactId))).size;
  const owed = sumMoney(rows.map((r) => r.tuition.owed));

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">
          {groups.filter((g) => g.active).length} {groups.filter((g) => g.active).length === 1 ? "clase" : "clases"} · {students}{" "}
          {students === 1 ? "alumno" : "alumnos"}
          {owed > 0 ? ` · ${formatMXNShort(owed)} por cobrar` : ""}
        </div>
        <h1 className="page-title">Clases</h1>
      </div>

      <div className="section">
        {rows.length === 0 ? (
          <div className="card">
            <EmptyState
              icon="graduation"
              title="Sin clases todavía"
              body="Crea un grupo con sus días y horario. Angus agenda las sesiones, te deja pasar lista y cobra la colegiatura cada mes."
            />
          </div>
        ) : (
          <div className="card">
            {rows.map(({ group, occupancy, next, untaken, tuition }, i) => (
              <button key={group.id} type="button" className="row-item list-entry-stagger" style={stagger(i)} onClick={() => setOpen(group.id)}>
                <div className="row-content">
                  <div className="row-title">{group.name}</div>
                  <div className="row-sub">
                    {next ? `Próxima ${formatWithWeekday(next.date)}${next.startTime ? ` ${next.startTime}` : ""}` : "Sin sesiones próximas"}
                    {" · "}
                    {occupancy.enrolled} {occupancy.enrolled === 1 ? "alumno" : "alumnos"}
                    {occupancy.capacity ? ` de ${occupancy.capacity}` : ""}
                  </div>
                </div>
                <div className="money-row-right">
                  <span className="money-badges">
                    {untaken > 0 && <span className="badge badge-amber">Pasar lista</span>}
                    {tuition.overdue > 0 && <span className="badge badge-red">{tuition.overdue} vencido{tuition.overdue === 1 ? "" : "s"}</span>}
                    {occupancy.full && <span className="badge badge-teal">Lleno</span>}
                  </span>
                  {tuition.owed > 0 && <span className="row-amount amount-owe">{formatMXNShort(tuition.owed)}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <button className="fab" onClick={() => setCreating(true)} aria-label="Nueva clase">
        <Icon name="plus" size={24} strokeWidth={2.2} />
      </button>

      {creating && <ClassGroupSheet group={null} onClose={() => setCreating(false)} />}
      {open && <ClassGroupDetailSheet groupId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
