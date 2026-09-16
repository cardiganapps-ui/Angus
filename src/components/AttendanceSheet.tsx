import { useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { Attendance, AttendanceStatus, ClassGroup, Sale, ScheduleEvent } from "../types";
import { ATTENDANCE_STATUS } from "../data/constants";
import { activeEnrollments } from "../utils/classes";
import { formatWithWeekday, todayISO } from "../utils/dates";
import { formatMXN } from "../utils/money";
import { makeId } from "../utils/id";
import { Sheet } from "./Sheet";
import { SegmentedControl } from "./SegmentedControl";
import { haptic } from "../lib/haptics";

/* ── AttendanceSheet ──
   "Pasar lista" for one session: every enrolled student with a
   three-way choice, defaulting to present. Saving writes the whole
   list in one request; re-opening edits it. A per-session tuition
   group gets a sale per attending student.

   Every write here is awaited and the toast is gated on the result.
   This sheet used to fire three `void` promises and announce "Lista
   guardada" over all of them — for a per-session group that meant a
   rejected insert silently lost the session's billing while the screen
   said it was saved. */

const STATUS_ITEMS = ATTENDANCE_STATUS.map((s) => ({ k: s.value, l: s.short }));

// Amber = a pending consequence she should look at, never colour alone.
const WARN_TEXT: CSSProperties = { color: "var(--amber)" };

export function AttendanceSheet({ group, session, onClose }: { group: ClassGroup; session: ScheduleEvent; onClose: () => void }) {
  const { contacts, enrollments, attendance, addAttendance, updateAttendance, addSales, sales } = useApp();
  const { showSuccess, showToast } = useToast();
  const students = activeEnrollments(enrollments, group.id, session.date)
    .map((e) => contacts.find((c) => c.id === e.contactId))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .sort((a, b) => a.name.localeCompare(b.name));
  const existing = new Map(attendance.filter((a) => a.eventId === session.id).map((a) => [a.contactId, a]));
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries(students.map((s) => [s.id, existing.get(s.id)?.status ?? "present"]))
  );
  const [submitting, setSubmitting] = useState(false);

  const tuition = group.tuitionAmount;
  const perSession = group.tuitionCadence === "per_session" && !!tuition;
  /* Who already has a tuition sale for this session. The key is the
     session's own id (migration 010's per-session shape), so one student
     can only be billed once for it however many times this sheet saves. */
  const billed = new Set(
    sales
      .filter((x) => x.periodKey === session.id && x.recurringRuleId === null && x.category === "class")
      .map((x) => x.contactId)
  );
  const toBill = perSession
    ? students.filter((s) => draft[s.id] === "present" && !billed.has(s.id))
    : [];
  // Already charged, now being marked absent: the sale does NOT follow.
  const billedNowAway = perSession
    ? students.filter((s) => draft[s.id] !== "present" && billed.has(s.id))
    : [];

  function fail(message: string) {
    setSubmitting(false);
    haptic.warn();
    showToast(message, "error");
  }

  async function save() {
    if (submitting) return;
    setSubmitting(true);
    const created = todayISO();

    const edits: { row: Attendance; status: AttendanceStatus }[] = [];
    for (const s of students) {
      const row = existing.get(s.id);
      if (row && row.status !== draft[s.id]) edits.push({ row, status: draft[s.id] });
    }
    const toInsert: Attendance[] = students
      .filter((s) => !existing.has(s.id))
      .map((s) => ({ id: makeId(), eventId: session.id, contactId: s.id, status: draft[s.id], createdAt: created }));

    /* Attendance first, and awaited before any sale: the tuition rows
       below are derived from who was present, so they must never land
       against a roll call the server rejected. */
    const written = await Promise.all([
      ...edits.map((e) => updateAttendance(e.row.id, { status: e.status })),
      toInsert.length ? addAttendance(toInsert) : Promise.resolve(true)
    ]);
    if (written.some((ok) => !ok)) {
      fail(
        "No se pudo guardar toda la lista, así que no se creó ningún cobro. La dejamos abierta tal como la marcaste: vuelve a intentar."
      );
      return;
    }

    const newSales: Sale[] = toBill.map((s) => ({
      id: makeId(),
      title: `${group.name} · ${formatWithWeekday(session.date)}`,
      amount: tuition as number,
      date: session.date,
      status: "confirmed" as const,
      category: "class" as const,
      paymentTerms: "single" as const,
      projectId: null,
      contactId: s.id,
      eventId: session.id,
      recurringRuleId: null,
      periodKey: session.id,
      notes: "",
      createdAt: created
    }));
    if (newSales.length) {
      const ok = await addSales(newSales);
      if (!ok) {
        fail(
          newSales.length === 1
            ? "Guardamos la asistencia, pero no se pudo crear el cobro de esta sesión. Toca Guardar otra vez."
            : `Guardamos la asistencia, pero no se pudieron crear los ${newSales.length} cobros de esta sesión. Toca Guardar otra vez.`
        );
        return;
      }
    }

    haptic.success();
    showSuccess(
      newSales.length
        ? `Lista guardada · ${newSales.length} ${newSales.length === 1 ? "cobro creado" : "cobros creados"}`
        : "Lista guardada"
    );
    onClose();
  }

  const present = Object.values(draft).filter((s) => s === "present").length;

  return (
    <Sheet
      title="Pasar lista"
      onClose={submitting ? null : onClose}
      footer={
        <div className="sheet-actions">
          <div className="sheet-actions-state">
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={submitting || students.length === 0}>
              {submitting ? "Guardando…" : `Guardar · ${present} de ${students.length}`}
            </button>
          </div>
        </div>
      }
    >
      <div className="money-submeta" style={{ marginBottom: 12 }}>
        {group.name} · {formatWithWeekday(session.date)}
        {session.startTime ? ` · ${session.startTime}` : ""}
      </div>
      {/* Per-session tuition turns a roll call into money. Say so before
          she taps Guardar, not after. */}
      {toBill.length > 0 && (
        <div className="input-help" style={{ marginTop: 0, marginBottom: 12 }}>
          Al guardar se {toBill.length === 1 ? "crea 1 cobro" : `crean ${toBill.length} cobros`} de{" "}
          {formatMXN(tuition as number)}, uno por alumno presente.
        </div>
      )}
      {billedNowAway.length > 0 && (
        <div className="input-help" style={{ ...WARN_TEXT, marginTop: 0, marginBottom: 12 }}>
          Esta sesión ya se le cobró a {billedNowAway.map((s) => s.name).join(", ")}. Marcar la falta
          no cancela ese cobro: si no aplica, cancélalo en Dinero.
        </div>
      )}
      {students.length === 0 ? (
        <div className="money-list">
          <div className="money-list-empty">Nadie inscrito en esta clase para esta fecha.</div>
        </div>
      ) : (
        <div className="money-list">
          {students.map((s) => (
            <div className="row-item" key={s.id} style={{ cursor: "default", flexWrap: "wrap", gap: 8 }}>
              <div className="row-content" style={{ flex: "1 1 120px" }}>
                <div className="row-title">{s.name}</div>
              </div>
              <div style={{ flex: "1 1 200px", minWidth: 200 }}>
                <SegmentedControl
                  items={STATUS_ITEMS}
                  value={draft[s.id]}
                  onChange={(k) => {
                    haptic.tap();
                    setDraft((d) => ({ ...d, [s.id]: k as AttendanceStatus }));
                  }}
                  size="sm"
                  role="radiogroup"
                  ariaLabel={`Asistencia de ${s.name}`}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
