import { useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { ClassGroup, Contact, ScheduleEvent } from "../types";
import {
  activeEnrollments,
  attendanceRate,
  groupOccupancy,
  groupSessions,
  sessionsWithoutAttendance,
  summarizeTuition,
  tuitionStatus,
  type TuitionState
} from "../utils/classes";
import { describeSeries } from "../utils/series";
import { formatMXN, formatMXNShort } from "../utils/money";
import { formatWithWeekday, monthRange, todayISO } from "../utils/dates";
import { makeId } from "../utils/id";
import { Sheet } from "./Sheet";
import { Icon } from "./Icon";
import { SegmentedControl } from "./SegmentedControl";
import { PickerSheet } from "./PickerSheet";
import { ClassGroupSheet } from "./ClassGroupSheet";
import { AttendanceSheet } from "./AttendanceSheet";
import { SaleDetailSheet } from "./SaleDetailSheet";
import { ContactSheet } from "./ContactSheet";
import { haptic } from "../lib/haptics";

type Tab = "students" | "sessions" | "tuition";
const TAB_ITEMS = [
  { k: "students", l: "Alumnos" },
  { k: "sessions", l: "Sesiones" },
  { k: "tuition", l: "Cobros" }
];
const TUITION_BADGE: Record<TuitionState, string> = {
  paid: "badge-green",
  pending: "badge-amber",
  overdue: "badge-red",
  none: "badge-gray"
};
const TUITION_LABEL: Record<TuitionState, string> = {
  paid: "Al corriente",
  pending: "Pendiente",
  overdue: "Vencido",
  none: "Sin cobro"
};

/* ── ClassGroupDetailSheet ──
   One class: its students (enroll from contacts, or create one on the
   spot), its sessions (tap to pass list), and this month's tuition per
   student (tap to open the sale). */
export function ClassGroupDetailSheet({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const {
    groups,
    enrollments,
    attendance,
    contacts,
    events,
    rules,
    sales,
    payments,
    addEnrollment,
    updateEnrollment,
    addRule,
    updateRule
  } = useApp();
  const { showSuccess } = useToast();
  const [tab, setTab] = useState<Tab>("students");
  const [editing, setEditing] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [newContact, setNewContact] = useState(false);
  const [session, setSession] = useState<ScheduleEvent | null>(null);
  const [saleId, setSaleId] = useState<string | null>(null);
  const closeRef = useRef<(() => void) | null>(null);
  const today = todayISO();

  const live = groups.find((g) => g.id === groupId) ?? null;
  const last = useRef<ClassGroup | null>(live);
  if (live) last.current = live;
  const group = live ?? last.current;

  const active = useMemo(() => (group ? activeEnrollments(enrollments, group.id, today) : []), [enrollments, group, today]);
  const sessions = useMemo(() => (group ? groupSessions(group, events) : []), [group, events]);
  const pastSessions = sessions.filter((s) => s.date <= today);
  const nextSession = [...sessions].reverse().find((s) => s.date >= today) ?? null;
  const untaken = useMemo(() => sessionsWithoutAttendance(sessions, attendance, today), [sessions, attendance, today]);
  const tuition = useMemo(
    () => (group ? tuitionStatus(group, enrollments, rules, sales, payments, today, today) : []),
    [group, enrollments, rules, sales, payments, today]
  );
  const tuitionSummary = summarizeTuition(tuition);

  if (!group) return null;
  const occupancy = groupOccupancy(group, enrollments, today);
  const nameOf = (id: string) => contacts.find((c) => c.id === id)?.name ?? "Alumno";
  const enrolledIds = new Set(active.map((e) => e.contactId));
  const candidates = contacts
    .filter((c) => !enrolledIds.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: c.name }));

  async function enroll(contactId: string) {
    if (!group) return;
    haptic.success();
    // Re-activate a past enrollment or create a new one.
    const previous = enrollments.find((e) => e.groupId === group.id && e.contactId === contactId);
    let ruleId: string | null = previous?.recurringRuleId ?? null;
    if (group.tuitionCadence === "monthly" && group.tuitionAmount) {
      if (ruleId && rules.some((r) => r.id === ruleId)) {
        void updateRule(ruleId, { active: true, amount: group.tuitionAmount, endDate: null });
      } else {
        ruleId = makeId();
        const ok = await addRule({
          id: ruleId,
          kind: "income",
          title: `Colegiatura · ${nameOf(contactId)} · ${group.name}`,
          amount: group.tuitionAmount,
          category: "class",
          cadence: "monthly",
          interval: 1,
          startDate: monthRange(today).from < today ? today : monthRange(today).from,
          endDate: null,
          contactId,
          projectId: null,
          groupId: group.id,
          active: true,
          notes: "",
          createdAt: today
        });
        if (!ok) ruleId = null;
      }
    }
    if (previous) {
      void updateEnrollment(previous.id, { startedOn: today, endedOn: null, recurringRuleId: ruleId });
    } else {
      void addEnrollment({
        id: makeId(),
        groupId: group.id,
        contactId,
        startedOn: today,
        endedOn: null,
        recurringRuleId: ruleId,
        notes: "",
        createdAt: today
      });
    }
    showSuccess(`${nameOf(contactId)} inscrito`);
  }

  function unenroll(enrollmentId: string) {
    const e = enrollments.find((x) => x.id === enrollmentId);
    if (!e) return;
    haptic.warn();
    void updateEnrollment(e.id, { endedOn: today });
    if (e.recurringRuleId) void updateRule(e.recurringRuleId, { active: false, endDate: today });
    showSuccess(`${nameOf(e.contactId)} dado de baja`);
  }

  return (
    <>
      <Sheet
        title={group.name}
        onClose={onClose}
        closeRef={closeRef}
        footer={
          <div className="sheet-actions">
            <div className="sheet-actions-state">
              {tab === "sessions" && nextSession && nextSession.date === today ? (
                <button type="button" className="btn btn-primary" onClick={() => setSession(nextSession)}>
                  Pasar lista de hoy
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => setEnrolling(true)}>
                  Inscribir alumno
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
                Editar clase
              </button>
            </div>
          </div>
        }
      >
        <div className="money-submeta" style={{ marginBottom: 12 }}>
          {group.seriesId ? describeSeries(seriesShapeFor(group.seriesId, events)) : "Sin horario"}
          {group.location ? ` · ${group.location}` : ""}
          {nextSession ? ` · próxima ${formatWithWeekday(nextSession.date)}` : ""}
        </div>

        <div className="money-panel">
          <div className="money-stats" style={{ marginBottom: 0 }}>
            <div>
              <div className="money-stat-label">Alumnos</div>
              <div className="money-stat-value">
                {occupancy.enrolled}
                {occupancy.capacity ? ` / ${occupancy.capacity}` : ""}
              </div>
            </div>
            <div>
              <div className="money-stat-label">Al corriente</div>
              <div className="money-stat-value money-stat-value--paid">
                {tuitionSummary.paid}
                {active.length ? ` de ${active.length}` : ""}
              </div>
            </div>
            <div>
              <div className="money-stat-label">Por cobrar</div>
              <div className={`money-stat-value ${tuitionSummary.owed > 0 ? "money-stat-value--owed" : ""}`}>
                {formatMXNShort(tuitionSummary.owed)}
              </div>
            </div>
          </div>
          {untaken.length > 0 && (
            <div className="money-submeta" style={{ marginTop: 8 }}>
              {untaken.length === 1 ? "1 sesión sin pasar lista" : `${untaken.length} sesiones sin pasar lista`}.
            </div>
          )}
        </div>

        <SegmentedControl items={TAB_ITEMS} value={tab} onChange={(k) => setTab(k as Tab)} size="sm" ariaLabel="Sección" />

        {tab === "students" && (
          <div className="money-list" style={{ marginTop: 14 }}>
            {active.length === 0 ? (
              <div className="money-list-empty">Nadie inscrito todavía. Inscribe a tus alumnos desde tus contactos.</div>
            ) : (
              active
                .map((e) => ({ e, contact: contacts.find((c) => c.id === e.contactId) }))
                .filter((x): x is { e: (typeof active)[number]; contact: Contact } => !!x.contact)
                .sort((a, b) => a.contact.name.localeCompare(b.contact.name))
                .map(({ e, contact }) => {
                  const rate = attendanceRate(contact.id, pastSessions, attendance);
                  const t = tuition.find((x) => x.contactId === contact.id);
                  return (
                    <div className="row-item" key={e.id} style={{ cursor: "default" }}>
                      <div className="row-content">
                        <div className="row-title">{contact.name}</div>
                        <div className="row-sub">
                          {rate.rate === null ? "Sin asistencias aún" : `Asiste ${rate.rate}% · ${rate.present} de ${rate.present + rate.absent}`}
                          {" · desde "}
                          {formatWithWeekday(e.startedOn)}
                        </div>
                      </div>
                      {t && <span className={`badge ${TUITION_BADGE[t.state]}`}>{TUITION_LABEL[t.state]}</span>}
                      <button type="button" className="row-icon-btn btn-tap" aria-label={`Dar de baja a ${contact.name}`} onClick={() => unenroll(e.id)}>
                        <Icon name="x" size={16} strokeWidth={2.2} />
                      </button>
                    </div>
                  );
                })
            )}
          </div>
        )}

        {tab === "sessions" && (
          <div className="money-list" style={{ marginTop: 14 }}>
            {sessions.length === 0 ? (
              <div className="money-list-empty">Sin sesiones agendadas. Edita la clase para definir los días.</div>
            ) : (
              sessions.slice(0, 20).map((s) => {
                const rows = attendance.filter((a) => a.eventId === s.id);
                const present = rows.filter((a) => a.status === "present").length;
                const past = s.date <= today;
                return (
                  <button key={s.id} type="button" className={`row-item ${!past ? "row-item--muted" : ""}`} onClick={() => setSession(s)}>
                    <div className="row-content">
                      <div className="row-title">{formatWithWeekday(s.date)}</div>
                      <div className="row-sub">
                        {s.startTime ?? ""}
                        {rows.length ? ` · ${present} de ${rows.length} asistieron` : past ? " · sin pasar lista" : " · próxima"}
                      </div>
                    </div>
                    {past && rows.length === 0 && <span className="badge badge-amber">Pasar lista</span>}
                    {rows.length > 0 && <span className="badge badge-green">Lista tomada</span>}
                    <span className="row-chevron" aria-hidden="true">
                      <Icon name="chevron-right" size={16} />
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}

        {tab === "tuition" && (
          <div className="money-list" style={{ marginTop: 14 }}>
            {tuition.length === 0 ? (
              <div className="money-list-empty">Sin alumnos inscritos.</div>
            ) : (
              tuition.map((t) => (
                <button
                  key={t.contactId}
                  type="button"
                  className="row-item"
                  disabled={!t.saleId}
                  style={!t.saleId ? { cursor: "default" } : undefined}
                  onClick={() => t.saleId && setSaleId(t.saleId)}
                >
                  <div className="row-content">
                    <div className="row-title">{nameOf(t.contactId)}</div>
                    <div className="row-sub">
                      {t.state === "none"
                        ? group.tuitionCadence === "per_session"
                          ? "Se cobra por sesión al pasar lista"
                          : "Sin cobro este mes todavía"
                        : `Este mes · ${formatMXN(t.amount)}`}
                    </div>
                  </div>
                  <div className="money-row-right">
                    <span className={`badge ${TUITION_BADGE[t.state]}`}>{TUITION_LABEL[t.state]}</span>
                    {t.owed > 0 && <span className="row-amount amount-owe">{formatMXN(t.owed)}</span>}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </Sheet>

      {enrolling && (
        <PickerSheet
          title="Inscribir alumno"
          options={[{ value: "__new__", label: "+ Nuevo contacto" }, ...candidates]}
          value=""
          placeholder="Elige un contacto"
          onSelect={(id) => {
            setEnrolling(false);
            if (id === "__new__") setNewContact(true);
            else if (id) void enroll(id);
          }}
          onClose={() => setEnrolling(false)}
        />
      )}
      {newContact && (
        <ContactSheet
          contact={null}
          onClose={() => setNewContact(false)}
          onCreated={(id) => {
            setNewContact(false);
            void enroll(id);
          }}
        />
      )}
      {editing && (
        <ClassGroupSheet
          group={group}
          onClose={() => setEditing(false)}
          onDeleted={() => {
            setEditing(false);
            (closeRef.current ?? onClose)();
          }}
        />
      )}
      {session && <AttendanceSheet group={group} session={session} onClose={() => setSession(null)} />}
      {saleId && <SaleDetailSheet saleId={saleId} onClose={() => setSaleId(null)} />}
    </>
  );
}

/* The series shape for describeSeries, reconstructed from the group's
   occurrences when the series itself isn't handy. */
function seriesShapeFor(seriesId: string, events: ScheduleEvent[]) {
  const dates = events.filter((e) => e.seriesId === seriesId && !e.cancelled).map((e) => e.date).sort();
  const weekdays = [...new Set(dates.map((d) => new Date(d + "T00:00:00").getDay()))];
  return { cadence: "weekly" as const, weekdays, startDate: dates[0] ?? todayISO(), endDate: null };
}
