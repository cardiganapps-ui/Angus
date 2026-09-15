import type { Expense, Installment, Payment, Sale } from "../types";
import { remainder, subtractMoney, sumMoney, toCents } from "./money";

/* ── Canonical money formulas ──
   These are the only place balances are derived. Nothing is stored
   denormalized, so there is nothing to drift.

     committed = Σ(sale.amount) over sales that COUNT
                   • status = confirmed  (agreed, not yet handed over)
                   • status = delivered  (handed over)
                   • status = quoted    → does NOT count (not yet real)
                   • status = cancelled → NEVER counts
     paid      = Σ(payment.amount) over payments of counting sales
     owed      = Σ over counting sales of max(0, sale.amount − paid(sale))
     credit    = Σ over counting sales of max(0, paid(sale) − sale.amount)

   Payments against a cancelled sale are excluded from `paid` — a refund
   is recorded by deleting the payment, not by negating it.

   If you add a SaleStatus, decide here whether it counts, say so in the
   block above, mirror it in the sales.status check constraint, and add
   a test in __tests__/accounting.test.ts. */

export function saleCountsTowardRevenue(sale: Sale): boolean {
  return sale.status === "confirmed" || sale.status === "delivered";
}

export function paymentsForSale(payments: Payment[], saleId: string): Payment[] {
  return payments.filter((p) => p.saleId === saleId);
}

export function paidForSale(payments: Payment[], saleId: string): number {
  return sumMoney(paymentsForSale(payments, saleId).map((p) => p.amount));
}

export interface SaleBalance {
  sale: Sale;
  paid: number;
  owed: number;
  credit: number;
  settled: boolean;
}

export function saleBalance(sale: Sale, payments: Payment[]): SaleBalance {
  const paid = paidForSale(payments, sale.id);
  if (!saleCountsTowardRevenue(sale)) {
    return { sale, paid, owed: 0, credit: 0, settled: true };
  }
  const owed = remainder(sale.amount, paid);
  const credit = remainder(paid, sale.amount);
  return { sale, paid, owed, credit, settled: toCents(owed) === 0 };
}

export interface Totals {
  committed: number;
  paid: number;
  owed: number;
  credit: number;
}

export function totals(sales: Sale[], payments: Payment[]): Totals {
  const counting = sales.filter(saleCountsTowardRevenue);
  const balances = counting.map((s) => saleBalance(s, payments));
  return {
    committed: sumMoney(counting.map((s) => s.amount)),
    paid: sumMoney(balances.map((b) => b.paid)),
    owed: sumMoney(balances.map((b) => b.owed)),
    credit: sumMoney(balances.map((b) => b.credit))
  };
}

/** What one client still owes across all their sales. */
export function contactOwed(contactId: string, sales: Sale[], payments: Payment[]): number {
  return totals(
    sales.filter((s) => s.contactId === contactId),
    payments
  ).owed;
}

/* ── Payment plans ──
   Installments are expectations; payments are truth. Rather than marking
   an installment "paid" (a second source of truth that can drift), the
   sale's payments are allocated across its installments in due-date
   order: the oldest installment absorbs money first. */

export type InstallmentState = "paid" | "partial" | "pending" | "overdue";

export interface InstallmentStatus {
  installment: Installment;
  covered: number;
  remaining: number;
  state: InstallmentState;
}

export function installmentPlan(
  saleId: string,
  installments: Installment[],
  payments: Payment[],
  today: string
): InstallmentStatus[] {
  const ordered = installments
    .filter((i) => i.saleId === saleId)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));

  let pool = toCents(paidForSale(payments, saleId));

  return ordered.map((installment) => {
    const due = toCents(installment.amount);
    const coveredCents = Math.min(pool, due);
    pool -= coveredCents;
    const covered = coveredCents / 100;
    const remainingCents = due - coveredCents;

    let state: InstallmentState;
    if (remainingCents === 0) state = "paid";
    else if (installment.dueDate < today) state = "overdue";
    else if (coveredCents > 0) state = "partial";
    else state = "pending";

    return { installment, covered, remaining: remainingCents / 100, state };
  });
}

/** Installments already due and not fully covered, oldest first. */
export function overdueInstallments(
  sales: Sale[],
  installments: Installment[],
  payments: Payment[],
  today: string
): InstallmentStatus[] {
  return sales
    .filter(saleCountsTowardRevenue)
    .flatMap((sale) => installmentPlan(sale.id, installments, payments, today))
    .filter((s) => s.state === "overdue")
    .sort((a, b) => a.installment.dueDate.localeCompare(b.installment.dueDate));
}

/* ── Profit & loss ──
   Cash in (payments received) vs cash out (expenses) over a date range,
   both inclusive. Uses payments rather than committed sales so the
   figure answers "what actually moved this month". */

export interface ProfitLoss {
  income: number;
  expenses: number;
  net: number;
}

function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

export function profitLoss(
  sales: Sale[],
  payments: Payment[],
  expenses: Expense[],
  from: string,
  to: string
): ProfitLoss {
  const countingIds = new Set(sales.filter(saleCountsTowardRevenue).map((s) => s.id));
  const income = sumMoney(
    payments.filter((p) => countingIds.has(p.saleId) && inRange(p.date, from, to)).map((p) => p.amount)
  );
  const spent = sumMoney(expenses.filter((e) => inRange(e.date, from, to)).map((e) => e.amount));
  return { income, expenses: spent, net: subtractMoney(income, spent) };
}

export function expensesByCategory(expenses: Expense[], from: string, to: string) {
  const buckets = new Map<string, number>();
  for (const e of expenses) {
    if (!inRange(e.date, from, to)) continue;
    buckets.set(e.category, sumMoney([buckets.get(e.category) ?? 0, e.amount]));
  }
  return [...buckets.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}
