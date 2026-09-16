import type { Expense, ExpenseCategory, IncomeCategory, RecurringRule, Sale } from "../types";
import { occurrencesBetween } from "./recurrence";
import { addDays } from "./dates";

/* ── Materialization ──
   A rule is an intention; money is rows. Each occurrence that has come
   due (plus a short look-ahead for income, so an expected tuition shows
   in "Por cobrar" before its date) becomes a real Sale or Expense with
   `recurringRuleId` + `periodKey`. The unique index on that pair is the
   idempotency guarantee across devices; this function only decides
   what is MISSING locally, and useCloudStore treats a 23505 as "already
   there". Nothing here mutates — the caller inserts. */

export const INCOME_LOOKAHEAD_DAYS = 14;

/* How far back a single rule may fill in on its own.

   occurrencesBetween runs from the rule's OWN startDate, so a monthly
   rule dated 2015 used to insert ~130 expenses into her P&L the moment
   the app loaded — silently rewriting a decade of months she never
   entered. A rule created today for a real ongoing cost should still
   catch up over a reasonable stretch, so this is a cap rather than a
   ban: everything older than the cap is reported separately for the UI
   to offer, never inserted on its own. */
export const MAX_BACKFILL_PERIODS = 24;

export interface Pending {
  sales: Omit<Sale, "id" | "createdAt">[];
  expenses: Omit<Expense, "id" | "createdAt">[];
  /** Rules with history beyond the cap, and how much they held back. */
  deferred: { ruleId: string; skipped: number; oldest: string }[];
}

export function pendingMaterializations(
  rules: RecurringRule[],
  sales: Sale[],
  expenses: Expense[],
  today: string,
  incomeLookaheadDays = INCOME_LOOKAHEAD_DAYS,
  maxBackfill = MAX_BACKFILL_PERIODS
): Pending {
  const have = new Set<string>();
  for (const s of sales) if (s.recurringRuleId && s.periodKey) have.add(`${s.recurringRuleId}:${s.periodKey}`);
  for (const e of expenses) if (e.recurringRuleId && e.periodKey) have.add(`${e.recurringRuleId}:${e.periodKey}`);

  const out: Pending = { sales: [], expenses: [], deferred: [] };
  for (const rule of rules) {
    if (!rule.active) continue;
    const horizon = rule.kind === "income" ? addDays(today, incomeLookaheadDays) : today;
    const all = occurrencesBetween(rule, rule.startDate, horizon);
    const missing = all.filter((occ) => !have.has(`${rule.id}:${occ.periodKey}`));
    /* Keep the MOST RECENT window: the periods she is likely to care
       about are the ones just gone, not a rule's first year. */
    const eligible = missing.length > maxBackfill ? missing.slice(missing.length - maxBackfill) : missing;
    if (missing.length > eligible.length) {
      out.deferred.push({
        ruleId: rule.id,
        skipped: missing.length - eligible.length,
        oldest: missing[0].date
      });
    }
    for (const occ of eligible) {
      const key = `${rule.id}:${occ.periodKey}`;
      if (have.has(key)) continue;
      have.add(key);
      if (rule.kind === "income") {
        out.sales.push({
          title: rule.title,
          amount: rule.amount,
          date: occ.date,
          status: "confirmed",
          category: rule.category as IncomeCategory,
          paymentTerms: "single",
          projectId: rule.projectId,
          contactId: rule.contactId,
          eventId: null,
          recurringRuleId: rule.id,
          periodKey: occ.periodKey,
          notes: ""
        });
      } else {
        out.expenses.push({
          title: rule.title,
          amount: rule.amount,
          date: occ.date,
          category: rule.category as ExpenseCategory,
          method: null,
          projectId: rule.projectId,
          eventId: null,
          courseId: rule.courseId,
          recurringRuleId: rule.id,
          periodKey: occ.periodKey,
          notes: ""
        });
      }
    }
  }
  return out;
}
