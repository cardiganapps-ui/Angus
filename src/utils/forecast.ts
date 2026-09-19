import type { Expense, Installment, Payment, RecurringRule, Sale } from "../types";
import { installmentPlan, saleBalance, saleCountsTowardRevenue } from "./accounting";
import { addMonths, monthRange, parseISODate } from "./dates";
import { fromCents, subtractMoney, sumMoney, toCents } from "./money";
import { occurrencesBetween } from "./recurrence";

/* ── Forecast ──
   A forward-looking cash view, month by month, that is honest about how
   sure each number is:

     committedIn   money someone already agreed to pay — unpaid cuotas by
                   due date (overdue ones land in the current month) and
                   the remainder of confirmed sales without a plan
     recurringIn   future occurrences of income rules not yet materialized
     estimatedIn   new sales, guessed from the trailing average of payments
                   on non-recurring sales — the softest line, shown apart
     recurringOut  future occurrences of expense rules not yet materialized
     estimatedOut  variable spend, guessed from the trailing average of
                   non-recurring expenses
     actualIn/Out  what already happened this month (month 0 only)

   projectedIn/Out sum everything; committedNet uses only the sure lines.
   Every assumption the numbers rest on is returned as Spanish copy so
   the screen can say it out loud. Nothing here mutates. */

export interface ForecastMonth {
  month: string; // "YYYY-MM"
  actualIn: number;
  actualOut: number;
  committedIn: number;
  recurringIn: number;
  estimatedIn: number;
  recurringOut: number;
  estimatedOut: number;
  projectedIn: number;
  projectedOut: number;
  projectedNet: number;
  /** Net using only actual + committed + recurring — no estimates. */
  committedNet: number;
  cumulative: number;
}

export interface Forecast {
  months: ForecastMonth[];
  assumptions: string[];
  /** First projected month whose cumulative goes negative, or null. */
  runway: string | null;
  averages: { variableOut: number; newSalesIn: number; monthsSampled: number };
}

export interface ForecastInput {
  sales: Sale[];
  payments: Payment[];
  installments: Installment[];
  expenses: Expense[];
  rules: RecurringRule[];
  today: string;
  months?: number;
  /** Trailing full months used for the variable averages. */
  sampleMonths?: number;
}

const monthKey = (iso: string) => iso.slice(0, 7);

export function forecast({
  sales,
  payments,
  installments,
  expenses,
  rules,
  today,
  months = 6,
  sampleMonths = 3
}: ForecastInput): Forecast {
  const currentMonth = monthKey(today);
  const firstOfMonth = monthRange(today).from;
  const keys = Array.from({ length: months }, (_, i) => monthKey(addMonths(firstOfMonth, i)));
  const lastDay = monthRange(addMonths(firstOfMonth, months - 1)).to;
  const bucket = new Map<string, ForecastMonth>(
    keys.map((month) => [
      month,
      {
        month,
        actualIn: 0,
        actualOut: 0,
        committedIn: 0,
        recurringIn: 0,
        estimatedIn: 0,
        recurringOut: 0,
        estimatedOut: 0,
        projectedIn: 0,
        projectedOut: 0,
        projectedNet: 0,
        committedNet: 0,
        cumulative: 0
      }
    ])
  );
  const cents = new Map<string, Record<string, number>>(
    keys.map((k) => [k, { actualIn: 0, actualOut: 0, committedIn: 0, recurringIn: 0, recurringOut: 0 }])
  );
  const addCents = (month: string, field: string, value: number) => {
    const target = month < currentMonth ? currentMonth : month;
    const row = cents.get(target);
    if (row) row[field] += value;
  };

  // ── Actuals this month ──
  const countingIds = new Set(sales.filter(saleCountsTowardRevenue).map((s) => s.id));
  const thisMonth = monthRange(today);
  for (const p of payments) {
    if (countingIds.has(p.saleId) && p.date >= thisMonth.from && p.date <= thisMonth.to) {
      addCents(currentMonth, "actualIn", toCents(p.amount));
    }
  }
  for (const e of expenses) {
    if (e.date >= thisMonth.from && e.date <= thisMonth.to) addCents(currentMonth, "actualOut", toCents(e.amount));
  }

  // ── Committed income ──
  const planned = new Set(installments.map((i) => i.saleId));
  for (const sale of sales) {
    if (!countingIds.has(sale.id)) continue;
    if (planned.has(sale.id)) {
      let plannedCents = 0;
      for (const status of installmentPlan(sale.id, installments, payments, today)) {
        if (status.remaining <= 0) continue;
        plannedCents += toCents(status.remaining);
        if (status.installment.dueDate > lastDay) continue;
        addCents(monthKey(status.installment.dueDate), "committedIn", toCents(status.remaining));
      }
      // A plan that no longer covers the sale (amount raised after the
      // cuotas were built) still owes the difference — count it on the sale's month.
      const uncovered = toCents(saleBalance(sale, payments).owed) - plannedCents;
      if (uncovered > 0 && sale.date <= lastDay) addCents(monthKey(sale.date), "committedIn", uncovered);
    } else {
      const owed = saleBalance(sale, payments).owed;
      if (owed <= 0) continue;
      if (sale.date > lastDay) continue;
      addCents(monthKey(sale.date), "committedIn", toCents(owed));
    }
  }

  // ── Recurring rules, virtual occurrences ──
  const materialized = new Set<string>();
  for (const s of sales) if (s.recurringRuleId && s.periodKey) materialized.add(`${s.recurringRuleId}:${s.periodKey}`);
  for (const e of expenses) if (e.recurringRuleId && e.periodKey) materialized.add(`${e.recurringRuleId}:${e.periodKey}`);
  for (const rule of rules) {
    if (!rule.active) continue;
    for (const occ of occurrencesBetween(rule, today, lastDay)) {
      if (materialized.has(`${rule.id}:${occ.periodKey}`)) continue;
      addCents(monthKey(occ.date), rule.kind === "income" ? "recurringIn" : "recurringOut", toCents(rule.amount));
    }
  }

  // ── Estimates from the trailing full months ──
  const sampleFrom = monthRange(addMonths(firstOfMonth, -sampleMonths)).from;
  const sampleTo = monthRange(addMonths(firstOfMonth, -1)).to;
  const inSample = (d: string) => d >= sampleFrom && d <= sampleTo;
  const variableOutCents = expenses
    .filter((e) => !e.recurringRuleId && inSample(e.date))
    .reduce((t, e) => t + toCents(e.amount), 0);
  const nonRecurringSaleIds = new Set(sales.filter((s) => countingIds.has(s.id) && !s.recurringRuleId).map((s) => s.id));
  const newSalesInCents = payments
    .filter((p) => nonRecurringSaleIds.has(p.saleId) && inSample(p.date))
    .reduce((t, p) => t + toCents(p.amount), 0);
  const hasHistory = variableOutCents > 0 || newSalesInCents > 0;
  const avgOut = hasHistory ? Math.round(variableOutCents / sampleMonths) : 0;
  const avgIn = hasHistory ? Math.round(newSalesInCents / sampleMonths) : 0;

  // How much of the current month is still ahead: scale the estimate.
  const day = parseISODate(today).getDate();
  const daysInMonth = parseISODate(thisMonth.to).getDate();
  const remainingFraction = Math.max(0, (daysInMonth - day) / daysInMonth);

  // ── Assemble ──
  let cumulative = 0;
  const out: ForecastMonth[] = keys.map((month, i) => {
    const c = cents.get(month)!;
    const fraction = i === 0 ? remainingFraction : 1;
    const estimatedOut = Math.round(avgOut * fraction);
    const estimatedIn = Math.round(avgIn * fraction);
    const projectedIn = c.actualIn + c.committedIn + c.recurringIn + estimatedIn;
    const projectedOut = c.actualOut + c.recurringOut + estimatedOut;
    const projectedNet = projectedIn - projectedOut;
    const committedNet = c.actualIn + c.committedIn + c.recurringIn - c.actualOut - c.recurringOut;
    cumulative += projectedNet;
    const row = bucket.get(month)!;
    row.actualIn = fromCents(c.actualIn);
    row.actualOut = fromCents(c.actualOut);
    row.committedIn = fromCents(c.committedIn);
    row.recurringIn = fromCents(c.recurringIn);
    row.estimatedIn = fromCents(estimatedIn);
    row.recurringOut = fromCents(c.recurringOut);
    row.estimatedOut = fromCents(estimatedOut);
    row.projectedIn = fromCents(projectedIn);
    row.projectedOut = fromCents(projectedOut);
    row.projectedNet = fromCents(projectedNet);
    row.committedNet = fromCents(committedNet);
    row.cumulative = fromCents(cumulative);
    return row;
  });

  const assumptions: string[] = [];
  const activeRules = rules.filter((r) => r.active);
  if (activeRules.length) {
    assumptions.push(
      `Tus ${activeRules.length === 1 ? "regla recurrente sigue" : `${activeRules.length} reglas recurrentes siguen`} igual que hoy.`
    );
  }
  if (hasHistory) {
    assumptions.push(
      `Los gastos variables siguen el promedio de los últimos ${sampleMonths} meses (${formatShortInline(fromCents(avgOut))} al mes).`
    );
    assumptions.push(
      `Los ingresos nuevos siguen el promedio de lo cobrado en los últimos ${sampleMonths} meses (${formatShortInline(fromCents(avgIn))} al mes).`
    );
  } else {
    assumptions.push("Sin historial suficiente para estimar gastos variables ni ingresos nuevos: solo se proyecta lo comprometido y lo recurrente.");
  }
  const overdue = out[0]?.committedIn ?? 0;
  if (overdue > 0) assumptions.push("Lo que ya te deben (incluido lo vencido) se cobra dentro del mes en curso.");

  const runway = out.find((m) => m.cumulative < 0)?.month ?? null;

  return {
    months: out,
    assumptions,
    runway,
    averages: { variableOut: fromCents(avgOut), newSalesIn: fromCents(avgIn), monthsSampled: sampleMonths }
  };
}

/** Sum a field across forecast months, cent-exact. */
export function forecastTotal(months: ForecastMonth[], field: keyof Omit<ForecastMonth, "month">): number {
  return sumMoney(months.map((m) => m[field]));
}

export function forecastNet(months: ForecastMonth[]): { projected: number; committed: number } {
  return {
    projected: subtractMoney(forecastTotal(months, "projectedIn"), forecastTotal(months, "projectedOut")),
    committed: forecastTotal(months, "committedNet")
  };
}

function formatShortInline(value: number): string {
  return `$${Math.round(value).toLocaleString("es-MX")}`;
}
