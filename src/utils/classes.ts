import type {
  Attendance,
  ClassEnrollment,
  ClassGroup,
  Payment,
  RecurringRule,
  Sale,
  ScheduleEvent
} from "../types";
import { saleBalance, saleCountsTowardRevenue } from "./accounting";
import { monthRange } from "./dates";
import { fromCents, toCents } from "./money";

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
