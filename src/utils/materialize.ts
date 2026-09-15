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

export interface Pending {
  sales: Omit<Sale, "id" | "createdAt">[];
  expenses: Omit<Expense, "id" | "createdAt">[];
}

export function pendingMaterializations(
  rules: RecurringRule[],
  sales: Sale[],
  expenses: Expense[],
  today: string,
  incomeLookaheadDays = INCOME_LOOKAHEAD_DAYS
): Pending {
  const have = new Set<string>();
  for (const s of sales) if (s.recurringRuleId && s.periodKey) have.add(`${s.recurringRuleId}:${s.periodKey}`);
  for (const e of expenses) if (e.recurringRuleId && e.periodKey) have.add(`${e.recurringRuleId}:${e.periodKey}`);

  const out: Pending = { sales: [], expenses: [] };
  for (const rule of rules) {
    if (!rule.active) continue;
    const horizon = rule.kind === "income" ? addDays(today, incomeLookaheadDays) : today;
    for (const occ of occurrencesBetween(rule, rule.startDate, horizon)) {
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
          recurringRuleId: rule.id,
          periodKey: occ.periodKey,
          notes: ""
        });
      }
    }
  }
  return out;
}
