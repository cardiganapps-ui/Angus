import { useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { AttendanceStatus, ClassGroup, ScheduleEvent } from "../types";
import { ATTENDANCE_STATUS } from "../data/constants";
import { activeEnrollments } from "../utils/classes";
import { formatWithWeekday, todayISO } from "../utils/dates";
import { makeId } from "../utils/id";
import { Sheet } from "./Sheet";
import { SegmentedControl } from "./SegmentedControl";
import { haptic } from "../lib/haptics";

/* ── AttendanceSheet ──
   "Pasar lista" for one session: every enrolled student with a
   three-way choice, defaulting to present. Saving writes the whole
   list in one request; re-opening edits it. A per-session tuition
   group gets a sale per attending student. */

const STATUS_ITEMS = ATTENDANCE_STATUS.map((s) => ({ k: s.value, l: s.short }));

export function AttendanceSheet({ group, session, onClose }: { group: ClassGroup; session: ScheduleEvent; onClose: () => void }) {
  const { contacts, enrollments, attendance, addAttendance, updateAttendance, addSales, sales } = useApp();
  const { showSuccess } = useToast();
  const students = activeEnrollments(enrollments, group.id, session.date)
    .map((e) => contacts.find((c) => c.id === e.contactId))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .sort((a, b) => a.name.localeCompare(b.name));
  const existing = new Map(attendance.filter((a) => a.eventId === session.id).map((a) => [a.contactId, a]));
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries(students.map((s) => [s.id, existing.get(s.id)?.status ?? "present"]))
  );
  const [submitting, setSubmitting] = useState(false);

  function save() {
    setSubmitting(true);
    const created = todayISO();
    const toInsert = students
      .filter((s) => !existing.has(s.id))
      .map((s) => ({ id: makeId(), eventId: session.id, contactId: s.id, status: draft[s.id], createdAt: created }));
    for (const s of students) {
      const row = existing.get(s.id);
      if (row && row.status !== draft[s.id]) void updateAttendance(row.id, { status: draft[s.id] });
    }
    if (toInsert.length) void addAttendance(toInsert);

    // Per-session tuition: one sale per attending student, once.
    if (group.tuitionCadence === "per_session" && group.tuitionAmount) {
      const already = new Set(
        sales.filter((x) => x.periodKey === `${session.id}` && x.recurringRuleId === null && x.category === "class").map((x) => x.contactId)
      );
      const newSales = students
        .filter((s) => draft[s.id] === "present" && !already.has(s.id))
        .map((s) => ({
          id: makeId(),
          title: `${group.name} · ${formatWithWeekday(session.date)}`,
          amount: group.tuitionAmount as number,
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
      if (newSales.length) void addSales(newSales);
    }
    haptic.success();
    showSuccess("Lista guardada");
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
            <button type="button" className="btn btn-primary" onClick={save} disabled={submitting || students.length === 0}>
              Guardar · {present} de {students.length}
            </button>
          </div>
        </div>
      }
    >
      <div className="money-submeta" style={{ marginBottom: 12 }}>
        {group.name} · {formatWithWeekday(session.date)}
        {session.startTime ? ` · ${session.startTime}` : ""}
      </div>
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
