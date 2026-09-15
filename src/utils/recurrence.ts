import type { RecurrenceCadence, RecurringRule } from "../types";
import { addDays, addMonths } from "./dates";
import { fromCents, toCents } from "./money";

/* ── Recurrence ──
   Pure date math for rules. An occurrence is (date, periodKey); the key
   is what makes materialization idempotent — one row per rule per key,
   enforced by a unique index. Keys are the occurrence's own date, which
   is unique within a rule by construction (a rule never fires twice on
   one day) and reads well in the DB.

   Monthly-style cadences step with addMonths, which clamps to the last
   day of shorter months: a rule that starts on the 31st lands on Feb 28
   and comes back to the 31st in March, because each step is computed
   from the START date, never from the previous (already clamped) date. */

export interface Occurrence {
  date: string;
  periodKey: string;
}

type RuleShape = Pick<RecurringRule, "cadence" | "interval" | "startDate" | "endDate" | "active">;

/** The n-th occurrence (0-based) of a rule. */
export function nthOccurrence(rule: RuleShape, n: number): string {
  const step = Math.max(1, rule.interval) * n;
  switch (rule.cadence) {
    case "weekly":
      return addDays(rule.startDate, step * 7);
    case "biweekly":
      return addDays(rule.startDate, step * 14);
    case "monthly":
      return addMonths(rule.startDate, step);
    case "quarterly":
      return addMonths(rule.startDate, step * 3);
    case "yearly":
      return addMonths(rule.startDate, step * 12);
  }
}

export function periodKeyFor(date: string): string {
  return date;
}

/** Every occurrence with from <= date <= to (inclusive), in order. */
export function occurrencesBetween(rule: RuleShape, from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  if (to < from) return out;
  const last = rule.endDate && rule.endDate < to ? rule.endDate : to;
  for (let n = 0; n < 10_000; n++) {
    const date = nthOccurrence(rule, n);
    if (date > last) break;
    if (date >= from) out.push({ date, periodKey: periodKeyFor(date) });
  }
  return out;
}

/** The first occurrence strictly after `after`, or null if the rule has ended / is paused. */
export function nextOccurrence(rule: RuleShape, after: string): string | null {
  if (!rule.active) return null;
  for (let n = 0; n < 10_000; n++) {
    const date = nthOccurrence(rule, n);
    if (rule.endDate && date > rule.endDate) return null;
    if (date > after) return date;
  }
  return null;
}

/* How much a rule is worth per month, for "fijos al mes" bands and the
   forecast's estimated lines. Weekly × 52 / 12, etc. Cent-exact. */
const PER_YEAR: Record<RecurrenceCadence, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  quarterly: 4,
  yearly: 1
};

export function monthlyEquivalent(rule: Pick<RecurringRule, "amount" | "cadence" | "interval">): number {
  const perYear = PER_YEAR[rule.cadence] / Math.max(1, rule.interval);
  return fromCents(Math.round((toCents(rule.amount) * perYear) / 12));
}

/** "Cada mes", "Cada 2 semanas", "Cada 3 meses"… */
export function describeCadence(rule: Pick<RecurringRule, "cadence" | "interval">): string {
  const n = Math.max(1, rule.interval);
  const singular: Record<RecurrenceCadence, string> = {
    weekly: "Cada semana",
    biweekly: "Cada quincena",
    monthly: "Cada mes",
    quarterly: "Cada trimestre",
    yearly: "Cada año"
  };
  const plural: Record<RecurrenceCadence, string> = {
    weekly: "semanas",
    biweekly: "quincenas",
    monthly: "meses",
    quarterly: "trimestres",
    yearly: "años"
  };
  return n === 1 ? singular[rule.cadence] : `Cada ${n} ${plural[rule.cadence]}`;
}
