import type { Expense, ExpenseCategory, Installment, Payment, Sale } from "../types";
import { addDays, addMonths } from "./dates";
import { fromCents, remainder, splitEvenly, splitProportionally, subtractMoney, sumMoney, toCents } from "./money";

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

     refundable = Σ(payment.amount) over payments of CANCELLED sales

   A refund is recorded by deleting the payment, not by negating one
   (payments.amount has a `> 0` check). But between cancelling a sale
   and handing the money back, that cash is real and it is HERS TO
   RETURN — so it is reported as `refundable`, not dropped. Before, a
   $5 000 deposit on a cancelled commission vanished from every total
   while its payment row sat in the database: cash received no longer
   equalled cash reported, and nothing on screen said she owed it.

   `paid` still counts only counting sales, so revenue is unchanged.

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
  /** Money received on a CANCELLED sale — hers to give back, not revenue. */
  refundable: number;
  settled: boolean;
  /** Share of the total already received, 0–1. For progress bars. */
  progress: number;
}

export function saleBalance(sale: Sale, payments: Payment[]): SaleBalance {
  const paid = paidForSale(payments, sale.id);
  const totalCents = toCents(sale.amount);
  const paidCents = toCents(paid);
  // Ratio, not money: clamped so an overpayment can't overflow a bar.
  const progress =
    totalCents > 0 ? Math.min(1, paidCents / totalCents) : paidCents > 0 ? 1 : 0;
  if (!saleCountsTowardRevenue(sale)) {
    /* A cancelled sale that took money is NOT settled: she owes it back.
       A quoted one never took any, so it is. */
    const refundable = sale.status === "cancelled" ? paid : 0;
    return {
      sale,
      paid,
      owed: 0,
      credit: 0,
      refundable,
      settled: toCents(refundable) === 0,
      progress
    };
  }
  const owed = remainder(sale.amount, paid);
  const credit = remainder(paid, sale.amount);
  return { sale, paid, owed, credit, refundable: 0, settled: toCents(owed) === 0, progress };
}

/* "Entregada y pagada": the sale is finished on both sides — the piece
   left the studio and the money landed. Deliberately NOT `saleBalance().settled`,
   which is also true for a quote nobody has paid and for a cancelled sale
   that never took a deposit. Those still need her attention; this one
   doesn't, which is why Ingresos folds it away. */
export function saleIsClosed(sale: Sale, payments: Payment[]): boolean {
  if (sale.status !== "delivered") return false;
  return toCents(saleBalance(sale, payments).owed) === 0;
}

export interface Totals {
  committed: number;
  paid: number;
  owed: number;
  credit: number;
  /** Received on cancelled sales and not yet returned. */
  refundable: number;
}

export function totals(sales: Sale[], payments: Payment[]): Totals {
  const counting = sales.filter(saleCountsTowardRevenue);
  const balances = counting.map((s) => saleBalance(s, payments));
  // Partition rather than filter: the cancelled side carries a real
  // liability, and dropping it is how the money went missing.
  const cancelled = sales.filter((s) => s.status === "cancelled");
  return {
    committed: sumMoney(counting.map((s) => s.amount)),
    paid: sumMoney(balances.map((b) => b.paid)),
    owed: sumMoney(balances.map((b) => b.owed)),
    credit: sumMoney(balances.map((b) => b.credit)),
    refundable: sumMoney(cancelled.map((s) => paidForSale(payments, s.id)))
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

export type InstallmentFrequency = "monthly" | "biweekly";

export interface PlannedInstallment {
  amount: number;
  dueDate: string;
}

/* A plan is generated once and then stored as rows — `splitEvenly` is what
   guarantees the cuotas add back up to the sale total exactly: the leftover
   cents go onto the EARLIEST installments (8500/3 → 2833.34, 2833.33,
   2833.33), so the plan can't quietly under- or over-shoot the sale. */
export function generateInstallmentSchedule(
  total: number,
  count: number,
  firstDueDate: string,
  frequency: InstallmentFrequency
): PlannedInstallment[] {
  /* 15 days, not 14: a plan's "quincenal" is the quincena shape (~24 a
     year), which is what someone paying in quincenas expects. Recurring
     rules and event series use 14 and label themselves "cada 14 días" —
     see data/constants.ts INSTALLMENT_FREQUENCY. */
  return splitEvenly(total, count).map((amount, i) => ({
    amount,
    dueDate: frequency === "monthly" ? addMonths(firstDueDate, i) : addDays(firstDueDate, i * 15)
  }));
}

/* ── Plan reconciliation ──
   A plan is generated from the sale's total and then stored as rows, so
   the two can drift apart: editing the amount of a sale that already has
   cuotas used to write `amount` alone and leave the plan untouched. The
   cuotas then promised money that was not owed — forecast.ts projected
   it and Hoy surfaced the phantom overdue ones — and nothing on any
   screen said the plan no longer matched the sale.

   This is the detector. It reads the rows rather than a stored flag, so
   a plan broken by an older build is caught the first time she opens
   the sale. */

export interface PlanMismatch {
  /** Σ of the sale's cuotas. */
  planned: number;
  /** What the sale is actually worth. */
  amount: number;
  /** planned − amount. Positive: the plan asks for more than the sale. */
  difference: number;
  kind: "over" | "short";
}

/** Null when the sale has no plan, or its cuotas add up to it exactly. */
export function planMismatch(sale: Sale, installments: Installment[]): PlanMismatch | null {
  const rows = installments.filter((i) => i.saleId === sale.id);
  if (rows.length === 0) return null;
  const planned = sumMoney(rows.map((i) => i.amount));
  const difference = subtractMoney(planned, sale.amount);
  const differenceCents = toCents(difference);
  if (differenceCents === 0) return null;
  return { planned, amount: sale.amount, difference, kind: differenceCents > 0 ? "over" : "short" };
}

export interface RebuiltInstallment {
  /** The existing cuota this replaces, or null when one must be created. */
  id: string | null;
  amount: number;
  dueDate: string;
  /** Already covered by payments, so its amount is left where it is. */
  paid: boolean;
}

export interface PlanRebuild {
  /** The plan as it will stand, in due-date order. Sums to `amount`. */
  rows: RebuiltInstallment[];
  updates: { id: string; amount: number }[];
  removals: string[];
  additions: PlannedInstallment[];
  /** Nothing to write — the plan already lands on the new amount. */
  unchanged: boolean;
}

/* What it takes to make a sale's plan sum to `amount` again.

   Money already received is never re-planned: the cuotas payments cover
   IN FULL (a leading run, since installmentPlan allocates oldest-first)
   keep their amount, and only what is still an expectation is respread —
   over the cuotas that are left, on the due dates they already have.

   Two degenerate shapes:
     • nothing left to spread onto (every cuota already paid, and the
       total went up) → the difference becomes one more cuota;
     • the new total is at or below what she has already paid into the
       plan → the open cuotas go and the paid ones are trimmed to land
       exactly on the total. The payment rows are NOT touched; the
       surplus surfaces as `credit` on the sale, which is what an
       overpayment is.

   A non-positive amount clears the plan, and a sale with no plan is
   left alone — this repairs a plan, it never invents one. */
export function rebuildPlan(
  saleId: string,
  amount: number,
  installments: Installment[],
  payments: Payment[],
  today: string
): PlanRebuild {
  const empty: PlanRebuild = { rows: [], updates: [], removals: [], additions: [], unchanged: true };
  const statuses = installmentPlan(saleId, installments, payments, today);
  if (statuses.length === 0) return empty;

  const targetCents = toCents(amount);
  // Split at the first cuota payments do not cover in full.
  const openFrom = statuses.findIndex((s) => toCents(s.remaining) > 0);
  const split = openFrom < 0 ? statuses.length : openFrom;
  const paidRows = statuses.slice(0, split).map((s) => s.installment);
  const openRows = statuses.slice(split).map((s) => s.installment);
  const paidCents = paidRows.reduce((n, i) => n + toCents(i.amount), 0);
  const openTargetCents = targetCents - paidCents;

  const rows: RebuiltInstallment[] = [];
  const updates: { id: string; amount: number }[] = [];
  const removals: string[] = [];
  const additions: PlannedInstallment[] = [];

  if (openTargetCents > 0) {
    for (const i of paidRows) rows.push({ id: i.id, amount: i.amount, dueDate: i.dueDate, paid: true });
    if (openRows.length > 0) {
      /* Proportional, not even: the open cuotas already carry a shape she
         chose (a 30/70 anticipo, a front-loaded plan), and splitting the
         new total evenly would throw it away. splitProportionally keeps
         Σ cuotas === amount exact to the cent just the same, and makes
         rebuilding an already-correct plan a true no-op. */
      const amounts = splitProportionally(
        fromCents(openTargetCents),
        openRows.map((i) => i.amount)
      );
      openRows.forEach((i, n) => {
        rows.push({ id: i.id, amount: amounts[n], dueDate: i.dueDate, paid: false });
        if (toCents(i.amount) !== toCents(amounts[n])) updates.push({ id: i.id, amount: amounts[n] });
      });
    } else {
      /* Every cuota is paid and the sale grew: there is no expectation
         left to carry the difference, so it becomes one. Due today
         unless the plan still reaches into the future. */
      const last = paidRows[paidRows.length - 1]?.dueDate;
      const dueDate = last && last > today ? last : today;
      const row = { amount: fromCents(openTargetCents), dueDate };
      additions.push(row);
      rows.push({ id: null, ...row, paid: false });
    }
  } else {
    for (const i of openRows) removals.push(i.id);
    let usedCents = 0;
    for (const i of paidRows) {
      const fitsCents = Math.min(toCents(i.amount), targetCents - usedCents);
      if (fitsCents <= 0) {
        removals.push(i.id);
        continue;
      }
      usedCents += fitsCents;
      const next = fromCents(fitsCents);
      rows.push({ id: i.id, amount: next, dueDate: i.dueDate, paid: true });
      if (fitsCents !== toCents(i.amount)) updates.push({ id: i.id, amount: next });
    }
  }

  return {
    rows,
    updates,
    removals,
    additions,
    unchanged: updates.length === 0 && removals.length === 0 && additions.length === 0
  };
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
   figure answers "what actually moved this month".

   Income counts EVERY payment in the range, whatever its sale's status
   is today. It used to count only payments of currently-counting sales,
   which meant cancelling a sale in September silently changed March's
   reported net — a closed month rewritten by an edit made months later.
   Cash that arrived in March arrived in March; the obligation to give
   some of it back is a liability, reported by totals().refundable, not
   a retroactive edit to a period she has already read.

   It does not take `sales` at all any more, which is the point: a
   closed month's net CANNOT depend on a status edited later, because
   status is not an input. */

export interface ProfitLoss {
  income: number;
  expenses: number;
  net: number;
}

function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

export function profitLoss(
  payments: Payment[],
  expenses: Expense[],
  from: string,
  to: string
): ProfitLoss {
  const income = sumMoney(payments.filter((p) => inRange(p.date, from, to)).map((p) => p.amount));
  const spent = sumMoney(expenses.filter((e) => inRange(e.date, from, to)).map((e) => e.amount));
  return { income, expenses: spent, net: subtractMoney(income, spent) };
}

/* ── Refundable, scoped to a period ──
   `totals().refundable` answers "how much do I owe back right now", over
   all time. This answers a different question: of the cash that arrived
   in THIS range, how much is already earmarked for return — every payment
   in the range whose sale has since been cancelled.

   It is reported ALONGSIDE profitLoss, never subtracted inside it.
   profitLoss stays cash basis so a status edited in September cannot
   rewrite March. This figure is deliberately allowed to move when a
   status changes, which is why the only headline it may drive is the
   CURRENT month's goal — a target she is still working toward, not a
   closed month she has already read and acted on.

   Invariant: this is always a subset of profitLoss(...).income over the
   same range — both sum payments by date, this one over fewer of them.
   So `income − refundableInRange` can never go negative. */
export function refundableInRange(
  sales: Sale[],
  payments: Payment[],
  from: string,
  to: string
): number {
  const cancelled = new Set(sales.filter((s) => s.status === "cancelled").map((s) => s.id));
  return sumMoney(
    payments
      .filter((p) => cancelled.has(p.saleId) && inRange(p.date, from, to))
      .map((p) => p.amount)
  );
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

export interface CategoryShare {
  category: string;
  amount: number;
  /** Share of the range's total spend, 0–1 — the width of a bar. */
  share: number;
}

/** expensesByCategory plus each category's share of the total, for bars. */
export function expenseBreakdown(expenses: Expense[], from: string, to: string): CategoryShare[] {
  const byCategory = expensesByCategory(expenses, from, to);
  const totalCents = toCents(sumMoney(byCategory.map((c) => c.amount)));
  return byCategory.map((c) => ({
    ...c,
    share: totalCents > 0 ? toCents(c.amount) / totalCents : 0
  }));
}

/* ── Economics ──
   "Was it worth it?" for a piece, an expo, or a client. The same shape
   answers all three, because the question is identical and only the
   filter changes:

     revenue   = Σ amount over counting sales attributed to it
     collected = Σ payments actually received on those sales
     spent     = Σ expenses attributed to it
     margin    = revenue − spent   (what the work earned)
     cash      = collected − spent (what has actually landed)

   `margin` can be negative, and that is the point — an expo that cost
   more than it sold is exactly what she needs to see. Attribution is by
   explicit link (projectId / eventId); nothing is inferred. */

export interface Economics {
  revenue: number;
  collected: number;
  spent: number;
  margin: number;
  cash: number;
}

function economicsOf(sales: Sale[], payments: Payment[], expenses: Expense[]): Economics {
  const counting = sales.filter(saleCountsTowardRevenue);
  const revenue = sumMoney(counting.map((s) => s.amount));
  const collected = sumMoney(counting.map((s) => paidForSale(payments, s.id)));
  const spent = sumMoney(expenses.map((e) => e.amount));
  return {
    revenue,
    collected,
    spent,
    margin: subtractMoney(revenue, spent),
    cash: subtractMoney(collected, spent)
  };
}

/** What a piece cost to make versus what it sold for. */
export function projectEconomics(
  projectId: string,
  sales: Sale[],
  payments: Payment[],
  expenses: Expense[]
): Economics {
  return economicsOf(
    sales.filter((s) => s.projectId === projectId),
    payments,
    expenses.filter((e) => e.projectId === projectId)
  );
}

/** Whether an expo paid for itself. */
export function expoEconomics(
  eventId: string,
  sales: Sale[],
  payments: Payment[],
  expenses: Expense[]
): Economics {
  return economicsOf(
    sales.filter((s) => s.eventId === eventId),
    payments,
    expenses.filter((e) => e.eventId === eventId)
  );
}

export interface EconomicsRow {
  /** The project / event id the economics belong to. */
  id: string;
  economics: Economics;
}

function linkedIds(
  sales: Sale[],
  expenses: Expense[],
  key: "projectId" | "eventId"
): Set<string> {
  const ids = new Set<string>();
  for (const sale of sales) if (sale[key]) ids.add(sale[key]);
  for (const expense of expenses) if (expense[key]) ids.add(expense[key]);
  return ids;
}

/* Only pieces with money attached are judged: a piece nobody bought and
   nothing was spent on has no margin to read, and listing it as "$0"
   would bury the ones that do. Best margin first, id as the tie-break so
   the order is stable across renders. */
export function projectMargins(
  projectIds: string[],
  sales: Sale[],
  payments: Payment[],
  expenses: Expense[]
): EconomicsRow[] {
  const linked = linkedIds(sales, expenses, "projectId");
  return projectIds
    .filter((id) => linked.has(id))
    .map((id) => ({ id, economics: projectEconomics(id, sales, payments, expenses) }))
    .sort((a, b) => b.economics.margin - a.economics.margin || a.id.localeCompare(b.id));
}

/* Same filter for expos, but the caller's order is preserved — expos read
   chronologically (most recent first), not by how well they did. */
export function expoMargins(
  eventIds: string[],
  sales: Sale[],
  payments: Payment[],
  expenses: Expense[]
): EconomicsRow[] {
  const linked = linkedIds(sales, expenses, "eventId");
  return eventIds
    .filter((id) => linked.has(id))
    .map((id) => ({ id, economics: expoEconomics(id, sales, payments, expenses) }));
}

export interface ClientBalance {
  contactId: string;
  committed: number;
  collected: number;
  owed: number;
  /** A deposit on a cancelled sale — she owes THEM this. */
  refundable: number;
  /** Counting sales only; a cancelled one is not a sale she made. */
  saleCount: number;
}

/* Every client with a counting sale or a refund owed, those who owe money
   first, then by how much they've bought. Sales with no client attached
   are skipped — an unnamed buyer isn't someone you can chase. */
export function clientBalances(sales: Sale[], payments: Payment[]): ClientBalance[] {
  const byContact = new Map<string, Sale[]>();
  for (const sale of sales) {
    if (!sale.contactId) continue;
    /* Cancelled sales come in too. A client whose only sale was
       cancelled after paying a deposit used to vanish from this list
       entirely — refund owed and all — because the filter ran before any
       balance was built. `totals` keeps the two sides apart. */
    if (!saleCountsTowardRevenue(sale) && sale.status !== "cancelled") continue;
    const list = byContact.get(sale.contactId);
    if (list) list.push(sale);
    else byContact.set(sale.contactId, [sale]);
  }

  return [...byContact.entries()]
    .map(([contactId, contactSales]) => {
      const t = totals(contactSales, payments);
      return {
        contactId,
        committed: t.committed,
        collected: t.paid,
        owed: t.owed,
        refundable: t.refundable,
        saleCount: contactSales.filter(saleCountsTowardRevenue).length
      };
    })
    // A refund she owes is as actionable as money owed to her.
    .filter((b) => b.saleCount > 0 || toCents(b.refundable) > 0)
    .sort((a, b) => b.owed - a.owed || b.refundable - a.refundable || b.committed - a.committed);
}

/* ── Income by category ──
   Cash basis, like profitLoss: a payment counts for the category of the
   sale it settles, on the day it was received.

   The lookup is built from EVERY sale, not just the counting ones. It used
   to filter by `saleCountsTowardRevenue`, which silently dropped payments
   whose sale was later cancelled — while `profitLoss` (and therefore the
   "Cobrado" headline directly above this breakdown in Reportes) counted
   them. A $4 000 deposit on a commission cancelled in July made the KPI
   read $4 000 and the bars beneath it sum to $0, on the same screen, with
   nothing explaining the gap. Cash that arrived is cash that arrived; the
   obligation to give it back is a liability, reported by totals().refundable.

   INVARIANT: Σ(incomeByCategory) === profitLoss().income over the same
   range. Pinned by a test — do not reintroduce a status filter here. */
export function incomeByCategory(
  sales: Sale[],
  payments: Payment[],
  from: string,
  to: string
): CategoryShare[] {
  const categoryOf = new Map(sales.map((s) => [s.id, s.category]));
  const buckets = new Map<string, number>();
  for (const p of payments) {
    const category = categoryOf.get(p.saleId);
    if (!category || !inRange(p.date, from, to)) continue;
    buckets.set(category, sumMoney([buckets.get(category) ?? 0, p.amount]));
  }
  const rows = [...buckets.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
  const totalCents = toCents(sumMoney(rows.map((r) => r.amount)));
  return rows.map((r) => ({ ...r, share: totalCents > 0 ? toCents(r.amount) / totalCents : 0 }));
}

/* ── Budgets ──
   A monthly limit per category (workspaces.settings.budgets) against
   what was actually spent in the range. `near` starts at 80 %. */
export type BudgetState = "ok" | "near" | "over";

export interface BudgetProgress {
  category: ExpenseCategory;
  limit: number;
  spent: number;
  /** spent / limit, clamped to 1 for bars. */
  ratio: number;
  remaining: number;
  state: BudgetState;
}

export function budgetProgress(
  expenses: Expense[],
  budgets: Partial<Record<ExpenseCategory, number>>,
  from: string,
  to: string
): BudgetProgress[] {
  const spentBy = new Map(expensesByCategory(expenses, from, to).map((c) => [c.category, c.amount]));
  return (Object.entries(budgets) as [ExpenseCategory, number][])
    .filter(([, limit]) => limit > 0)
    .map(([category, limit]) => {
      const spent = spentBy.get(category) ?? 0;
      const raw = toCents(spent) / toCents(limit);
      const state: BudgetState = raw > 1 ? "over" : raw >= 0.8 ? "near" : "ok";
      return {
        category,
        limit,
        spent,
        ratio: Math.min(1, raw),
        remaining: remainder(limit, spent),
        state
      };
    })
    .sort((a, b) => b.spent / b.limit - a.spent / a.limit);
}
