import type {
  Attendance,
  ClassEnrollment,
  ClassGroup,
  Payment,
  RecurringRule,
  Sale,
  ScheduleEvent
} from "../types";
import { paidForSale, saleBalance, saleCountsTowardRevenue } from "./accounting";
import { monthRange } from "./dates";
import { fromCents, sumMoney, toCents } from "./money";

/* ── Clases ──
   Derived facts about a class group: who is enrolled today, how full it
   is, attendance rates, and whether each student's tuition for a month
   has been collected. Pure. */

/** Enrollments active on `today` (started, not ended). */
export function activeEnrollments(enrollments: ClassEnrollment[], groupId: string, today: string): ClassEnrollment[] {
  return enrollments.filter(
    (e) => e.groupId === groupId && e.startedOn <= today && (e.endedOn === null || e.endedOn >= today)
  );
}

export interface Occupancy {
  enrolled: number;
  capacity: number | null;
  /** enrolled / capacity, clamped to 1; null without a capacity. */
  ratio: number | null;
  full: boolean;
}

export function groupOccupancy(group: ClassGroup, enrollments: ClassEnrollment[], today: string): Occupancy {
  const enrolled = activeEnrollments(enrollments, group.id, today).length;
  const capacity = group.capacity;
  return {
    enrolled,
    capacity,
    ratio: capacity ? Math.min(1, enrolled / capacity) : null,
    full: capacity !== null && enrolled >= capacity
  };
}

/** Sessions (events) of a group's series, past ones first. */
export function groupSessions(group: ClassGroup, events: ScheduleEvent[]): ScheduleEvent[] {
  if (!group.seriesId) return [];
  return events
    .filter((e) => e.seriesId === group.seriesId && !e.cancelled)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export interface AttendanceRate {
  sessions: number; // sessions with any attendance recorded
  present: number;
  absent: number;
  excused: number;
  /** present / (present + absent), null with nothing recorded. */
  rate: number | null;
}

/** A student's attendance across a group's sessions (only sessions that were taken). */
export function attendanceRate(contactId: string, sessions: ScheduleEvent[], attendance: Attendance[]): AttendanceRate {
  const ids = new Set(sessions.map((s) => s.id));
  let present = 0;
  let absent = 0;
  let excused = 0;
  for (const a of attendance) {
    if (a.contactId !== contactId || !ids.has(a.eventId)) continue;
    if (a.status === "present") present++;
    else if (a.status === "absent") absent++;
    else excused++;
  }
  const sessions_ = present + absent + excused;
  return {
    sessions: sessions_,
    present,
    absent,
    excused,
    rate: present + absent > 0 ? Math.round((present / (present + absent)) * 100) : null
  };
}

/** Sessions of the group that already happened but have no attendance yet. */
export function sessionsWithoutAttendance(sessions: ScheduleEvent[], attendance: Attendance[], today: string): ScheduleEvent[] {
  const taken = new Set(attendance.map((a) => a.eventId));
  return sessions.filter((s) => s.date <= today && !taken.has(s.id));
}

export type TuitionState = "paid" | "pending" | "overdue" | "none";

export interface StudentTuition {
  contactId: string;
  ruleId: string | null;
  /** The month's materialized sale, if any. */
  saleId: string | null;
  amount: number;
  owed: number;
  state: TuitionState;
}

/* For each active student, the tuition sale of the month containing
   `monthISO` (a materialized sale of their rule dated in that month) and
   whether it's been paid. `none` = no rule or no sale yet this month. */
export function tuitionStatus(
  group: ClassGroup,
  enrollments: ClassEnrollment[],
  rules: RecurringRule[],
  sales: Sale[],
  payments: Payment[],
  monthISO: string,
  today: string
): StudentTuition[] {
  const { from, to } = monthRange(monthISO);
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  return activeEnrollments(enrollments, group.id, today).map((e) => {
    const rule = e.recurringRuleId ? ruleById.get(e.recurringRuleId) ?? null : null;
    const sale = rule
      ? sales.find((s) => s.recurringRuleId === rule.id && s.date >= from && s.date <= to && saleCountsTowardRevenue(s)) ?? null
      : null;
    if (!sale) {
      return { contactId: e.contactId, ruleId: rule?.id ?? null, saleId: null, amount: rule?.amount ?? 0, owed: 0, state: "none" };
    }
    const b = saleBalance(sale, payments);
    const state: TuitionState = b.owed <= 0 ? "paid" : sale.date < today ? "overdue" : "pending";
    return { contactId: e.contactId, ruleId: rule?.id ?? null, saleId: sale.id, amount: sale.amount, owed: b.owed, state };
  });
}

export interface TuitionSummary {
  paid: number;
  pending: number;
  overdue: number;
  none: number;
  owed: number;
}

export function summarizeTuition(rows: StudentTuition[]): TuitionSummary {
  const out: TuitionSummary = { paid: 0, pending: 0, overdue: 0, none: 0, owed: 0 };
  let owedCents = 0;
  for (const r of rows) {
    out[r.state]++;
    owedCents += toCents(r.owed);
  }
  out.owed = fromCents(owedCents);
  return out;
}

/* ── Cobro por sesión ──
   A `per_session` group bills at roll call: one confirmed Sale per
   student who attended, keyed on the SESSION's own id (migration 010's
   third period_key shape) with no recurring rule behind it. Those facts
   together identify a sale a roll call generated — a manual sale to the
   same student on the same day carries `periodKey: null` and must never
   be touched by the attendance sheet. */
export function isPerSessionTuitionSale(sale: Sale, eventId: string): boolean {
  return sale.periodKey === eventId && sale.recurringRuleId === null && sale.category === "class";
}

/** The sale this session's roll call created for one student, if any. */
export function perSessionTuitionSale(sales: Sale[], eventId: string, contactId: string): Sale | null {
  return sales.find((s) => isPerSessionTuitionSale(s, eventId) && s.contactId === contactId) ?? null;
}

export interface RollCallEntry {
  contactId: string;
  /** Present. Absent and justified alike mean the session wasn't taken. */
  attending: boolean;
}

export interface TuitionBillingPlan {
  /** Students to bill: present, with no sale for this session yet. */
  toBill: string[];
  /** Billed, now marked away — their sale gets CANCELLED, never deleted. */
  toCancel: Sale[];
  /** Back to present after a cancellation — the same sale is revived. */
  toRestore: Sale[];
  /** Cash already received on the sales being cancelled: hers to give back. */
  refundable: number;
}

/* What saving a roll call owes the money side, for a per-session group.

   A student flipped to absent gets their sale CANCELLED rather than
   deleted, and this is the reason: a Payment may already exist against
   it. Deleting the sale cascades those payments away and destroys the
   record of money that really was received. Cancelling keeps the row,
   and accounting.ts already reports cash taken against a cancelled sale
   as `refundable` — "Por devolver" — which is exactly what money
   collected for a session that did not happen is. It is also reversible
   and it leaves an honest audit trail.

   Flipping back to present revives that same row instead of inserting a
   second one: the unique index on (period_key, contact_id) would reject
   the duplicate anyway, and a rejected insert is not a bill. */
export function planTuitionForRollCall(
  eventId: string,
  roll: RollCallEntry[],
  sales: Sale[],
  payments: Payment[]
): TuitionBillingPlan {
  const toBill: string[] = [];
  const toCancel: Sale[] = [];
  const toRestore: Sale[] = [];
  for (const { contactId, attending } of roll) {
    const existing = perSessionTuitionSale(sales, eventId, contactId);
    if (attending) {
      if (!existing) toBill.push(contactId);
      else if (existing.status === "cancelled") toRestore.push(existing);
    } else if (existing && existing.status !== "cancelled") {
      toCancel.push(existing);
    }
  }
  return { toBill, toCancel, toRestore, refundable: sumMoney(toCancel.map((s) => paidForSale(payments, s.id))) };
}
