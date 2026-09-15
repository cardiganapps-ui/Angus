import type { PaymentTerms } from "../types";
import type { InstallmentFrequency, PlannedInstallment } from "./accounting";
import { generateInstallmentSchedule } from "./accounting";
import { fromCents, toCents } from "./money";

/* ── Payment plan drafts ──
   What the PlanBuilder edits and what SaleSheet / SaleDetailSheet turn
   into installment rows.

   deposit_balance → two cuotas: the anticipo (a % of the total, due on
   the sale date) and the balance due on `balanceDate`.
   installments   → N equal cuotas from `firstDue` at `frequency`. */

export interface PlanDraft {
  depositPercent: number;
  balanceDate: string;
  count: string;
  firstDue: string;
  frequency: InstallmentFrequency;
}

/** The cuotas a draft would create, or null when the draft is incomplete. */
export function planRows(
  terms: PaymentTerms,
  total: number,
  saleDate: string,
  draft: PlanDraft
): PlannedInstallment[] | null {
  if (!(total > 0)) return null;
  if (terms === "deposit_balance") {
    if (!draft.balanceDate) return null;
    const depositCents = Math.round((toCents(total) * draft.depositPercent) / 100);
    const deposit = fromCents(depositCents);
    const balance = fromCents(toCents(total) - depositCents);
    if (deposit <= 0 || balance <= 0) return null;
    return [
      { amount: deposit, dueDate: saleDate },
      { amount: balance, dueDate: draft.balanceDate }
    ];
  }
  if (terms === "installments") {
    const count = Number(draft.count);
    if (!Number.isInteger(count) || count < 2 || count > 36 || !draft.firstDue) return null;
    return generateInstallmentSchedule(total, count, draft.firstDue, draft.frequency);
  }
  return null;
}

