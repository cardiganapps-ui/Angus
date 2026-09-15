import type { Course, Expense, ScheduleEvent } from "../types";
import { fromCents, sumMoney, toCents } from "./money";

/* ── Estudios ──
   Derived facts about the courses she takes: which sessions belong to a
   course, which is next, how many she has been to, and what the course
   has cost her so far. Pure; money goes through utils/money.ts. */

/** A course's sessions: its series' occurrences plus one-offs linked to it. Ascending. */
export function courseSessions(course: Course, events: ScheduleEvent[]): ScheduleEvent[] {
  return events
    .filter((e) => !e.cancelled && (e.courseId === course.id || (course.seriesId !== null && e.seriesId === course.seriesId)))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
}

/** The first session on or after `today`. */
export function nextSession(sessions: ScheduleEvent[], today: string): ScheduleEvent | null {
  return sessions.find((s) => s.date >= today) ?? null;
}

export interface CourseTimeline {
  total: number;
  done: number; // sessions already past
  missed: number; // past sessions she flagged as missed
  upcoming: number;
}

export function courseTimeline(sessions: ScheduleEvent[], today: string): CourseTimeline {
  const past = sessions.filter((s) => s.date < today);
  return {
    total: sessions.length,
    done: past.length,
    missed: past.filter((s) => s.missed).length,
    upcoming: sessions.length - past.length
  };
}

export interface CourseCost {
  /** What the whole course costs, when that can be known; null otherwise. */
  total: number | null;
  /** Σ expenses linked to the course (any category). */
  paid: number;
  remaining: number | null;
}

/** Inclusive count of calendar months from one ISO date to another (2026-09-15 → 2026-12-01 = 4). */
export function monthsSpanned(from: string, to: string): number {
  if (to < from) return 0;
  const [y1, m1] = from.split("-").map(Number);
  const [y2, m2] = to.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

export function courseCost(course: Course, expenses: Expense[], sessions: ScheduleEvent[] = []): CourseCost {
  const paid = sumMoney(expenses.filter((e) => e.courseId === course.id).map((e) => e.amount));
  let total: number | null = null;
  if (course.paymentPlan === "free") total = 0;
  else if (course.cost !== null) {
    if (course.paymentPlan === "single") total = course.cost;
    else if (course.paymentPlan === "monthly" && course.startDate && course.endDate) {
      total = fromCents(toCents(course.cost) * monthsSpanned(course.startDate, course.endDate));
    } else if (course.paymentPlan === "per_session" && sessions.length > 0) {
      total = fromCents(toCents(course.cost) * sessions.length);
    }
  }
  const remaining = total === null ? null : fromCents(Math.max(0, toCents(total) - toCents(paid)));
  return { total, paid, remaining };
}

export interface CourseBuckets {
  active: Course[];
  upcoming: Course[];
  past: Course[];
}

/** En curso / Próximos / Terminados, by status first and dates second. */
export function coursesByStatus(courses: Course[], today: string): CourseBuckets {
  const out: CourseBuckets = { active: [], upcoming: [], past: [] };
  for (const c of courses) {
    if (c.status === "completed" || c.status === "dropped") out.past.push(c);
    else if (c.status === "upcoming" || (c.startDate !== null && c.startDate > today)) out.upcoming.push(c);
    else out.active.push(c);
  }
  const byName = (a: Course, b: Course) => a.name.localeCompare(b.name);
  out.active.sort(byName);
  out.upcoming.sort((a, b) => (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999") || byName(a, b));
  out.past.sort((a, b) => (b.endDate ?? b.createdAt).localeCompare(a.endDate ?? a.createdAt) || byName(a, b));
  return out;
}
