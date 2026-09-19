import { useMemo } from "react";
import type { Expense, Payment } from "../types";
import { monthlyTrend, trendChart } from "../utils/dashboard";
import { formatMXNShortSigned } from "../utils/money";
import { formatMonthLong, monthShort, monthName } from "../utils/dates";
import { BarChart } from "./charts/BarChart";

/* ── Cómo vienes ──
   The last six months as one bar each — cash basis, same numbers as
   Dinero, a closed month never rewritten. It lived at the top of Hoy
   until the pilot's first ask: she does not want a chart of her money
   to be the first thing she sees when she opens the app. It now sits in
   Dinero → Balance, where she goes when that IS the question. */

export const TREND_MONTHS = 6;

export function TrendChart({ payments, expenses, today }: { payments: Payment[]; expenses: Expense[]; today: string }) {
  const chart = useMemo(
    () => trendChart(monthlyTrend(payments, expenses, today, TREND_MONTHS), today.slice(0, 7)),
    [payments, expenses, today]
  );
  const flat = chart.max === 0 && chart.min === 0;

  return (
    <div className="section">
      <div className="section-header">
        <span className="section-title">Cómo vienes</span>
        <span className="eyebrow">Últimos {TREND_MONTHS} meses</span>
      </div>
      <div className={`card dash-trend${flat ? " dash-trend--flat" : ""}`}>
        <BarChart
          series={[{ key: "net", label: "Balance", color: "var(--green)", negColor: "var(--red)" }]}
          columns={chart.bars.map((bar) => ({
            key: bar.month,
            label: monthShort(bar.month),
            title: formatMonthLong(bar.month),
            values: { net: bar.net },
            current: bar.current
          }))}
          height={flat ? 36 : 124}
          signed
          labelCurrent
          ariaLabel={`Balance por mes: ${chart.bars
            .map((bar) => `${monthName(bar.month)} ${formatMXNShortSigned(bar.net)}`)
            .join(", ")}`}
        />
        {flat && (
          <div className="dash-trend-note">
            Aún no hay entradas ni gastos que graficar. En cuanto registres el primero, verás la
            forma de tu año aquí.
          </div>
        )}
      </div>
    </div>
  );
}
