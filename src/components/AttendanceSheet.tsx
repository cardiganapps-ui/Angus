import { useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { Attendance, AttendanceStatus, ClassGroup, Sale, ScheduleEvent } from "../types";
import { ATTENDANCE_STATUS } from "../data/constants";
import { activeEnrollments, planTuitionForRollCall } from "../utils/classes";
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
   said it was saved.

   Flipping a billed student to absent CANCELS their sale (it used to
   leave a confirmed cobro standing forever and tell her to go undo it
   by hand in Dinero). Never deletes it: see planTuitionForRollCall in
   utils/classes.ts for why cancelling is the only safe verb here. */

const STATUS_ITEMS = ATTENDANCE_STATUS.map((s) => ({ k: s.value, l: s.short }));

// Amber = a pending consequence she should look at, never colour alone.
const WARN_TEXT: CSSProperties = { color: "var(--amber)" };

export function AttendanceSheet({ group, session, onClose }: { group: ClassGroup; session: ScheduleEvent; onClose: () => void }) {
  const {
    contacts,
    enrollments,
    attendance,
    addAttendance,
    updateAttendance,
    addSales,
    updateSale,
    sales,
    payments
  } = useApp();
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
  /* What this roll call owes the money side. Keyed on the session's own
     id (migration 010's per-session shape), so a student can only ever
     hold one cobro for it however many times this sheet saves. */
  const billing = planTuitionForRollCall(
    session.id,
    perSession ? students.map((s) => ({ contactId: s.id, attending: draft[s.id] === "present" })) : [],
    sales,
    payments
  );
  const nameOf = (id: string | null) => students.find((s) => s.id === id)?.name ?? "Alumno";
  const namesOf = (rows: { contactId: string | null }[]) => rows.map((r) => nameOf(r.contactId)).join(", ");

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
        "No se pudo guardar toda la lista, así que no se tocó ningún cobro. La dejamos abierta tal como la marcaste: vuelve a intentar."
      );
      return;
    }

    const newSales: Sale[] = billing.toBill.map((contactId) => ({
      id: makeId(),
      title: `${group.name} · ${formatWithWeekday(session.date)}`,
      amount: tuition as number,
      date: session.date,
      status: "confirmed" as const,
      category: "class" as const,
      paymentTerms: "single" as const,
      projectId: null,
      contactId,
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

    /* Cancelled, never deleted: the sale may already have a payment
       against it, and deleting it would cascade that payment away —
       losing the record of money she really received. Cancelling leaves
       the row, moves any cash taken to "Por devolver", and is undone by
       marking the student present again. */
    if (billing.toCancel.length) {
      const done = await Promise.all(
        billing.toCancel.map((s) => updateSale(s.id, { status: "cancelled" as const }))
      );
      if (done.some((ok) => !ok)) {
        fail(
          `Guardamos la asistencia, pero el cobro de ${namesOf(billing.toCancel)} sigue activo. Toca Guardar otra vez para cancelarlo.`
        );
        return;
      }
    }
    if (billing.toRestore.length) {
      const done = await Promise.all(
        billing.toRestore.map((s) => updateSale(s.id, { status: "confirmed" as const }))
      );
      if (done.some((ok) => !ok)) {
        fail(
          `Guardamos la asistencia, pero el cobro de ${namesOf(billing.toRestore)} sigue cancelado. Toca Guardar otra vez para reactivarlo.`
        );
        return;
      }
    }

    haptic.success();
    const parts: string[] = [];
    if (newSales.length) {
      parts.push(`${newSales.length} ${newSales.length === 1 ? "cobro creado" : "cobros creados"}`);
    }
    if (billing.toCancel.length) {
      const n = billing.toCancel.length;
      parts.push(`${n} ${n === 1 ? "cobro cancelado" : "cobros cancelados"}`);
    }
    if (billing.toRestore.length) {
      const n = billing.toRestore.length;
      parts.push(`${n} ${n === 1 ? "cobro reactivado" : "cobros reactivados"}`);
    }
    // Name the money: a cancelled cobro that already took cash is a
    // refund she owes, not a line that quietly disappears.
    const refund = billing.refundable > 0 ? ` · ${formatMXN(billing.refundable)} por devolver` : "";
    showSuccess(parts.length ? `Lista guardada · ${parts.join(" · ")}${refund}` : "Lista guardada");
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
      {billing.toBill.length > 0 && (
        <div className="input-help" style={{ marginTop: 0, marginBottom: 12 }}>
          Al guardar se {billing.toBill.length === 1 ? "crea 1 cobro" : `crean ${billing.toBill.length} cobros`} de{" "}
          {formatMXN(tuition as number)}, uno por alumno presente.
        </div>
      )}
      {billing.toCancel.length > 0 && (
        <div className="input-help" style={{ ...WARN_TEXT, marginTop: 0, marginBottom: 12 }}>
          Al guardar se cancela el cobro de {namesOf(billing.toCancel)}: no tomó la sesión. La venta
          queda registrada como cancelada, no se borra, y vuelve si la marcas presente otra vez.
          {billing.refundable > 0 &&
            ` Ya recibiste ${formatMXN(billing.refundable)} de esos cobros: ese dinero pasa a "Por devolver".`}
        </div>
      )}
      {billing.toRestore.length > 0 && (
        <div className="input-help" style={{ marginTop: 0, marginBottom: 12 }}>
          Al guardar se reactiva el cobro de {namesOf(billing.toRestore)}, que estaba cancelado.
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
