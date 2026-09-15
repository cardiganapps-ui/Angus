import type { Contact, Expense, Payment, Project, Sale } from "../types";
import { profitLoss, saleBalance, saleCountsTowardRevenue } from "./accounting";
import { parseISODate } from "./dates";
import { fromCents, subtractMoney, sumMoney, toCents } from "./money";

/* ── Insights ──
   The numbers Reportes shows for a period. Cash basis wherever money is
   involved (payments, not committed sales), like profitLoss. Pure. */

const inRange = (d: string, from: string, to: string) => d >= from && d <= to;

export interface PeriodSummary {
  income: number;
  expenses: number;
  net: number;
  /** Counting sales agreed in the period. */
  salesCount: number;
  /** Of those, pieces and commissions — the work itself. */
  piecesSold: number;
  avgPiecePrice: number | null;
  /** Payments received in the period, on counting sales. */
  paymentsCount: number;
}

export function periodSummary(
  sales: Sale[],
  payments: Payment[],
  expenses: Expense[],
  from: string,
  to: string
): PeriodSummary {
  const pl = profitLoss(sales, payments, expenses, from, to);
  const counting = sales.filter((s) => saleCountsTowardRevenue(s) && inRange(s.date, from, to));
  const pieces = counting.filter((s) => s.category === "piece" || s.category === "commission");
  const countingIds = new Set(sales.filter(saleCountsTowardRevenue).map((s) => s.id));
  return {
    income: pl.income,
    expenses: pl.expenses,
    net: pl.net,
    salesCount: counting.length,
    piecesSold: pieces.length,
    avgPiecePrice: pieces.length ? fromCents(Math.round(toCents(sumMoney(pieces.map((p) => p.amount))) / pieces.length)) : null,
    paymentsCount: payments.filter((p) => countingIds.has(p.saleId) && inRange(p.date, from, to)).length
  };
}

export interface Delta {
  current: number;
  previous: number;
  change: number;
  /** Percent change, null when the previous value is 0. */
  percent: number | null;
}

export function delta(current: number, previous: number): Delta {
  const change = subtractMoney(current, previous);
  const prevCents = toCents(previous);
  return {
    current,
    previous,
    change,
    percent: prevCents === 0 ? null : Math.round((toCents(change) / Math.abs(prevCents)) * 100)
  };
}

export interface RankedRow {
  id: string;
  label: string;
  amount: number;
  share: number;
  count: number;
}

function rank(rows: Map<string, { label: string; cents: number; count: number }>, limit: number): RankedRow[] {
  const total = [...rows.values()].reduce((t, r) => t + r.cents, 0);
  return [...rows.entries()]
    .map(([id, r]) => ({ id, label: r.label, amount: fromCents(r.cents), share: total ? r.cents / total : 0, count: r.count }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** Collected income by the piece's medium (via the linked project). */
export function salesByMedium(
  sales: Sale[],
  payments: Payment[],
  projects: Project[],
  from: string,
  to: string,
  limit = 6
): RankedRow[] {
  const mediumOf = new Map(projects.map((p) => [p.id, p.medium.trim() || "Sin medio"]));
  const saleMedium = new Map<string, string>();
  for (const s of sales) {
    if (!saleCountsTowardRevenue(s)) continue;
    saleMedium.set(s.id, (s.projectId && mediumOf.get(s.projectId)) || "Sin pieza ligada");
  }
  const rows = new Map<string, { label: string; cents: number; count: number }>();
  const seenSales = new Set<string>();
  for (const p of payments) {
    const medium = saleMedium.get(p.saleId);
    if (!medium || !inRange(p.date, from, to)) continue;
    const row = rows.get(medium) ?? { label: medium, cents: 0, count: 0 };
    row.cents += toCents(p.amount);
    if (!seenSales.has(p.saleId)) {
      seenSales.add(p.saleId);
      row.count += 1;
    }
    rows.set(medium, row);
  }
  return rank(rows, limit);
}

/** Who paid the most in the period. */
export function topClients(
  sales: Sale[],
  payments: Payment[],
  contacts: Contact[],
  from: string,
  to: string,
  limit = 5
): RankedRow[] {
  const nameOf = new Map(contacts.map((c) => [c.id, c.name]));
  const contactOf = new Map<string, string | null>();
  for (const s of sales) if (saleCountsTowardRevenue(s)) contactOf.set(s.id, s.contactId);
  const rows = new Map<string, { label: string; cents: number; count: number }>();
  const seen = new Set<string>();
  for (const p of payments) {
    if (!contactOf.has(p.saleId) || !inRange(p.date, from, to)) continue;
    const contactId = contactOf.get(p.saleId) ?? "";
    if (!contactId) continue;
    const row = rows.get(contactId) ?? { label: nameOf.get(contactId) ?? "Contacto", cents: 0, count: 0 };
    row.cents += toCents(p.amount);
    if (!seen.has(p.saleId)) {
      seen.add(p.saleId);
      row.count += 1;
    }
    rows.set(contactId, row);
  }
  return rank(rows, limit);
}

export interface LeadFunnel {
  open: number;
  won: number;
  lost: number;
  /** won / (won + lost), null with nothing decided yet. */
  conversion: number | null;
}

/** Leads created in the period, by outcome. */
export function leadFunnel(contacts: Contact[], from: string, to: string): LeadFunnel {
  let open = 0;
  let won = 0;
  let lost = 0;
  for (const c of contacts) {
    if (c.relationship !== "lead" || !inRange(c.createdAt, from, to)) continue;
    if (c.leadStage === "won") won++;
    else if (c.leadStage === "lost") lost++;
    else open++;
  }
  return { open, won, lost, conversion: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null };
}

/** Average days from the sale date to the payment that settled it (settled sales only). */
export function avgDaysToCollect(sales: Sale[], payments: Payment[], from: string, to: string): number | null {
  const days: number[] = [];
  for (const s of sales) {
    if (!saleCountsTowardRevenue(s) || !inRange(s.date, from, to)) continue;
    if (!saleBalance(s, payments).settled || s.amount <= 0) continue;
    const own = payments.filter((p) => p.saleId === s.id).sort((a, b) => a.date.localeCompare(b.date));
    let cents = 0;
    const target = toCents(s.amount);
    for (const p of own) {
      cents += toCents(p.amount);
      if (cents >= target) {
        days.push(Math.max(0, Math.round((parseISODate(p.date).getTime() - parseISODate(s.date).getTime()) / 86_400_000)));
        break;
      }
    }
  }
  return days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null;
}

/** Months of a window ranked by net, best first. */
export function bestMonths(points: { month: string; net: number }[], limit = 3) {
  return [...points].sort((a, b) => b.net - a.net || a.month.localeCompare(b.month)).slice(0, limit);
}
