import type { RecurrenceCadence, RecurringRule } from "../types";
import { addDays, addMonths, weekRange } from "./dates";
import { fromCents, toCents } from "./money";

/* ── Recurrence ──
   Pure date math for rules. An occurrence is (date, periodKey); the key
   is what makes materialization idempotent — one row per rule per key,
   enforced by a unique index. The key names the PERIOD, not the day:
   "2026-09" for anything monthly or slower, the week's Monday for weekly
   and biweekly. Editing a rule's day of the month (or its cadence within
   the same family) therefore re-keys nothing, and the rows already
   generated stay the rows for those periods instead of being joined by
   duplicates.

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

export function periodKeyFor(cadence: RecurrenceCadence, date: string): string {
  return periodKeyFamily(cadence) === "week" ? weekRange(date, 1).from : date.slice(0, 7);
}

/* Which SHAPE of period key a cadence produces. Two cadences in the same
   family key the same periods the same way, so switching between them
   re-keys nothing and the unique index still recognises the rows already
   generated. Across families the shape changes — "2026-09" vs a Monday
   "2026-09-14" — so the old row and the new one do not collide, the
   index cannot see the clash, and the same month gets billed twice.
   Editing across families therefore needs a reconciliation pass, not a
   plain update. */
export function periodKeyFamily(cadence: RecurrenceCadence): "week" | "month" {
  return cadence === "weekly" || cadence === "biweekly" ? "week" : "month";
}

/** Every occurrence with from <= date <= to (inclusive), in order. */
export function occurrencesBetween(rule: RuleShape, from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  if (to < from) return out;
  const last = rule.endDate && rule.endDate < to ? rule.endDate : to;
  for (let n = 0; n < 10_000; n++) {
    const date = nthOccurrence(rule, n);
    if (date > last) break;
    if (date >= from) out.push({ date, periodKey: periodKeyFor(rule.cadence, date) });
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
   forecast's estimated lines. Weekly × 52 / 12, etc. Cent-exact.

   `biweekly` is 26 because nthOccurrence steps it by 14 days (365/14).
   It is NOT a Mexican quincena — that is the 15th and month-end, 24 a
   year, and would need its own cadence with its own occurrence rule and
   period key. The labels say "cada 14 días" so the promise matches. */
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
    biweekly: "Cada 14 días",
    monthly: "Cada mes",
    quarterly: "Cada trimestre",
    yearly: "Cada año"
  };
  const plural: Record<RecurrenceCadence, string> = {
    weekly: "semanas",
    biweekly: "días",
    monthly: "meses",
    quarterly: "trimestres",
    yearly: "años"
  };
  if (n === 1) return singular[rule.cadence];
  // "Cada 2 periodos de 14 días" is not something anyone says.
  if (rule.cadence === "biweekly") return `Cada ${n * 14} días`;
  return `Cada ${n} ${plural[rule.cadence]}`;
}
