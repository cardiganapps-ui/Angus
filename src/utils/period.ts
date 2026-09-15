import { formatRange, monthRange, todayISO, trailingMonthsRange, yearRange } from "./dates";

/* ── Periods ──
   The PeriodPicker's value: an anchor date + a span. periodRange() turns
   it into the inclusive {from, to} every money helper takes. */

export type PeriodSpan = "month" | "quarter" | "year";

export interface Period {
  anchor: string; // any ISO date inside the period
  span: PeriodSpan;
}

export function periodRange(period: Period): { from: string; to: string; label: string } {
  const r =
    period.span === "year"
      ? yearRange(period.anchor)
      : period.span === "quarter"
        ? trailingMonthsRange(period.anchor, 3)
        : monthRange(period.anchor);
  return { ...r, label: formatRange(r.from, r.to) };
}

export function currentPeriod(span: PeriodSpan = "month"): Period {
  return { anchor: todayISO(), span };
}

