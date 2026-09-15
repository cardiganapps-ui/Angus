import type { Contact, Expense, Installment, Payment, Project, Sale, ScheduleEvent } from "../types";
import { overdueInstallments, profitLoss, saleCountsTowardRevenue, totals } from "./accounting";
import { addMonths, daysUntil, monthRange } from "./dates";
import { fromCents, sumMoney, toCents } from "./money";

/* ── Dashboard derivations ──
   Everything the home screen shows is derived here so the screen stays a
   rendering of facts, not a place where facts get invented. Nothing here
   resolves names or formats money — it returns ids and numbers, and the
   screen looks up titles from context. That keeps it testable without a
   DOM and keeps the Spanish in one layer. */

export type AttentionKind = "installment" | "followup" | "deadline";

export interface AttentionItem {
  /** Stable React key — kind + the row it came from. */
  key: string;
  kind: AttentionKind;
  /** The date that makes it urgent. */
  date: string;
  /** Negative = overdue, 0 = today, positive = still ahead. */
  daysUntil: number;
  saleId?: string;
  contactId?: string;
  projectId?: string;
  amount?: number;
}

export interface AttentionSources {
  sales: Sale[];
  payments: Payment[];
  installments: Installment[];
  contacts: Contact[];
  projects: Project[];
}

/* One prioritized list of everything asking for her attention, so she
   doesn't have to tour four screens to find out whether she's behind.

   In scope: money she's owed and past due, leads whose follow-up date has
   arrived, and deliveries due soon or already late. Upcoming deadlines
   are included (within `horizonDays`) because a deadline is only useful
   BEFORE it passes; overdue money and follow-ups are only ever shown once
   they're actually due — a future installment isn't a problem yet.

   Ordered by date: the most overdue thing sits at the top. */
export function attentionItems(
  sources: AttentionSources,
  today: string,
  horizonDays = 7
): AttentionItem[] {
  const { sales, payments, installments, contacts, projects } = sources;
  const items: AttentionItem[] = [];

  for (const status of overdueInstallments(sales, installments, payments, today)) {
    const sale = sales.find((s) => s.id === status.installment.saleId);
    items.push({
      key: `installment:${status.installment.id}`,
      kind: "installment",
      date: status.installment.dueDate,
      daysUntil: daysUntil(status.installment.dueDate),
      saleId: status.installment.saleId,
      contactId: sale?.contactId ?? undefined,
      amount: status.remaining
    });
  }

  for (const contact of contacts) {
    if (!contact.followUpDate || contact.followUpDate > today) continue;
    items.push({
      key: `followup:${contact.id}`,
      kind: "followup",
      date: contact.followUpDate,
      daysUntil: daysUntil(contact.followUpDate),
      contactId: contact.id
    });
  }

  for (const project of projects) {
    if (!project.dueDate || project.status === "completed") continue;
    const days = daysUntil(project.dueDate);
    if (days > horizonDays) continue;
    items.push({
      key: `deadline:${project.id}`,
      kind: "deadline",
      date: project.dueDate,
      daysUntil: days,
      projectId: project.id,
      contactId: project.contactId ?? undefined
    });
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

export interface MonthPoint {
  /** "2026-09" */
  month: string;
  income: number;
  expenses: number;
  net: number;
}

/* Cash in and out for each of the last `count` months, oldest first, so a
   bar chart reads left-to-right like time does. The anchor is normalized
   to the 1st before stepping back, so a 31st never clamps its way into
   the wrong month. */
export function monthlyTrend(
  sales: Sale[],
  payments: Payment[],
  expenses: Expense[],
  anchorISO: string,
  count = 6
): MonthPoint[] {
  const firstOfAnchor = monthRange(anchorISO).from;
  const points: MonthPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const { from, to } = monthRange(addMonths(firstOfAnchor, -i));
    const pl = profitLoss(sales, payments, expenses, from, to);
    points.push({ month: from.slice(0, 7), income: pl.income, expenses: pl.expenses, net: pl.net });
  }
  return points;
}

export interface TrendBar {
  /** "2026-09" */
  month: string;
  net: number;
  /** Bar length as a fraction of the WHOLE chart box, 0–1. */
  height: number;
  /** Net ≥ 0 — the bar grows up from the zero line instead of down. */
  positive: boolean;
  current: boolean;
}

export interface TrendChart {
  bars: TrendBar[];
  /** Distance from the TOP of the box down to the zero line, 0–1. */
  zeroLine: number;
  /** Best and worst net in the window — the axis extremes. */
  max: number;
  min: number;
}

/* Bar geometry for the net-per-month chart. One scale serves both
   halves: the zero line sits exactly where the positive peak and the
   negative trough divide the box, so a millimetre of bar means the
   same number of pesos above and below it. A month whose net is zero
   gets no bar at all rather than a hairline that reads as "a little".

   Degenerate data is the point of testing this: an all-zero window
   drops the zero line to the bottom and gives every bar height 0 — a
   flat baseline, never a NaN height or a division by zero. */
export function trendChart(points: MonthPoint[], currentMonth: string): TrendChart {
  const cents = points.map((p) => toCents(p.net));
  const maxCents = Math.max(0, ...cents);
  const minCents = Math.min(0, ...cents);
  const span = maxCents - minCents;
  return {
    bars: points.map((point, i) => ({
      month: point.month,
      net: point.net,
      height: span === 0 ? 0 : Math.abs(cents[i]) / span,
      positive: cents[i] >= 0,
      current: point.month === currentMonth
    })),
    zeroLine: span === 0 ? 1 : maxCents / span,
    max: fromCents(maxCents),
    min: fromCents(minCents)
  };
}

export type NetDirection = "up" | "down" | "flat";

export interface NetDelta {
  direction: NetDirection;
  /** Size of the change, never negative — the direction carries the sign. */
  magnitude: number;
  /** "2026-08" — the month being compared against. */
  previousMonth: string;
}

/* Splits `moneyPulse().netChange` into a size and a direction so the
   screen can phrase it ("$2,500 más que agosto") without doing
   arithmetic on money. Null in, null out: no prior month means there
   is nothing to compare, which is not the same as "no change". */
export function netDelta(netChange: number | null, anchorISO: string): NetDelta | null {
  if (netChange === null) return null;
  const cents = toCents(netChange);
  return {
    direction: cents > 0 ? "up" : cents < 0 ? "down" : "flat",
    magnitude: fromCents(Math.abs(cents)),
    previousMonth: addMonths(monthRange(anchorISO).from, -1).slice(0, 7)
  };
}

export interface PracticeSnapshot {
  inProgress: number;
  parked: number;
  /** Counting sales agreed within the anchor month. */
  soldThisMonth: number;
  soldThisMonthAmount: number;
  classesAhead: number;
  nextExpo: ScheduleEvent | null;
  nextEvent: ScheduleEvent | null;
}

/** The state of the practice itself, as opposed to the money. */
export function practiceSnapshot(
  projects: Project[],
  events: ScheduleEvent[],
  sales: Sale[],
  today: string,
  horizonDays = 7
): PracticeSnapshot {
  const { from, to } = monthRange(today);
  const monthSales = sales.filter(
    (s) => saleCountsTowardRevenue(s) && s.date >= from && s.date <= to
  );
  const upcoming = events
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));

  return {
    inProgress: projects.filter((p) => p.status === "in_progress").length,
    parked: projects.filter((p) => p.status === "idea" || p.status === "on_hold").length,
    soldThisMonth: monthSales.length,
    soldThisMonthAmount: sumMoney(monthSales.map((s) => s.amount)),
    classesAhead: upcoming.filter((e) => e.kind === "class" && daysUntil(e.date) <= horizonDays).length,
    nextExpo: upcoming.find((e) => e.kind === "expo") ?? null,
    nextEvent: upcoming[0] ?? null
  };
}

export interface MoneyPulse {
  income: number;
  expenses: number;
  net: number;
  owed: number;
  /** Net change vs the previous month; null when there's no prior data. */
  netChange: number | null;
}

/** The money half of the dashboard: this month, versus last. */
export function moneyPulse(
  sales: Sale[],
  payments: Payment[],
  expenses: Expense[],
  today: string
): MoneyPulse {
  const [previous, current] = monthlyTrend(sales, payments, expenses, today, 2);
  const hadPrevious = previous.income !== 0 || previous.expenses !== 0;
  return {
    income: current.income,
    expenses: current.expenses,
    net: current.net,
    owed: totals(sales, payments).owed,
    netChange: hadPrevious ? current.net - previous.net : null
  };
}
