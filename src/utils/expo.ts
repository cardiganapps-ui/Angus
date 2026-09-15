import type { Expense, Payment, Sale } from "../types";
import { expoEconomics, type Economics } from "./accounting";
import { fromCents, toCents, subtractMoney } from "./money";

/* ── Expo report ──
   "Was this fair worth it?" — budget vs actual, how many pieces at the
   average price it takes to cover the costs, and a traffic-light verdict:

     green  it paid for itself in cash (collected ≥ spent)
     amber  it sold enough (revenue ≥ spent) but the money isn't all in
     red    it cost more than it sold, or nothing sold yet against a spend
     none   nothing to judge (no spend, no sales) */

export type ExpoSignal = "green" | "amber" | "red" | "none";

export interface ExpoReport extends Economics {
  budget: number | null;
  /** spent / budget, clamped to 1; null without a budget. */
  budgetRatio: number | null;
  overBudget: number; // > 0 when spent exceeds budget
  /** Pieces to sell at avgPiecePrice to cover the costs (or the budget, before the fair). */
  breakEvenPieces: number | null;
  /** Pieces still to sell to cover what's been spent, given revenue so far. */
  piecesToGo: number | null;
  signal: ExpoSignal;
}

export function expoReport(
  eventId: string,
  budget: number | null,
  sales: Sale[],
  payments: Payment[],
  expenses: Expense[],
  avgPiecePrice: number | null
): ExpoReport {
  const eco = expoEconomics(eventId, sales, payments, expenses);
  const spentCents = toCents(eco.spent);
  const revenueCents = toCents(eco.revenue);
  const collectedCents = toCents(eco.collected);
  const budgetCents = budget !== null && budget > 0 ? toCents(budget) : null;
  const costBasis = spentCents > 0 ? spentCents : (budgetCents ?? 0);
  const priceCents = avgPiecePrice !== null && avgPiecePrice > 0 ? toCents(avgPiecePrice) : null;

  let signal: ExpoSignal = "none";
  if (spentCents === 0 && revenueCents === 0) signal = "none";
  else if (collectedCents >= spentCents && revenueCents > 0) signal = "green";
  else if (revenueCents >= spentCents && spentCents > 0) signal = "amber";
  else if (spentCents === 0) signal = "green";
  else signal = "red";

  return {
    ...eco,
    budget,
    budgetRatio: budgetCents ? Math.min(1, spentCents / budgetCents) : null,
    overBudget: budgetCents ? fromCents(Math.max(0, spentCents - budgetCents)) : 0,
    breakEvenPieces: priceCents && costBasis > 0 ? Math.ceil(costBasis / priceCents) : null,
    piecesToGo: priceCents && spentCents > revenueCents ? Math.ceil((spentCents - revenueCents) / priceCents) : priceCents ? 0 : null,
    signal
  };
}

/** Spanish verdict copy for the signal. */
export function expoVerdict(report: ExpoReport, format: (n: number) => string): string {
  switch (report.signal) {
    case "green":
      return report.spent === 0
        ? `Sin gastos registrados y dejó ${format(report.revenue)}.`
        : `Se pagó sola y dejó ${format(report.cash)} en mano.`;
    case "amber":
      return `Vendió lo suficiente; faltan ${format(subtractMoney(report.revenue, report.collected))} por cobrar para cubrirla.`;
    case "red":
      return report.revenue === 0
        ? `Costó ${format(report.spent)} y todavía no vende.`
        : `Costó ${format(subtractMoney(report.spent, report.revenue))} más de lo que dejó.`;
    default:
      return "Sin gastos ni ventas ligadas todavía.";
  }
}
