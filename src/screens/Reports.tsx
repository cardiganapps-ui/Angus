import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import { EXPENSE_CATEGORY, EXPENSE_CATEGORY_BADGE, INCOME_CATEGORY, INCOME_CATEGORY_BADGE, labelFor } from "../data/constants";
import type { ExpenseCategory, IncomeCategory } from "../types";
import { expenseBreakdown, incomeByCategory } from "../utils/accounting";
import { monthlyTrend } from "../utils/dashboard";
import {
  avgDaysToCollect,
  bestMonths,
  delta,
  leadFunnel,
  periodSummary,
  salesByMedium,
  topClients,
  type Delta,
  type RankedRow
} from "../utils/insights";
import { formatMXN, formatMXNShort, formatMXNShortSigned } from "../utils/money";
import { addMonths, formatMonthLong, monthInitial, monthName, todayISO } from "../utils/dates";
import { currentPeriod, periodRange, type Period } from "../utils/period";
import { PeriodPicker } from "../components/PeriodPicker";
import { BarChart } from "../components/charts/BarChart";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { downloadCsv, expensesCsv, paymentsCsv, salesCsv } from "../lib/exportCsv";
import { haptic } from "../lib/haptics";

/* ── Reportes ──
   The period's story in numbers: the four KPIs against the previous
   period, where the money came from and went, the months that carried
   the year, who bought, how leads converted, and a CSV for whoever does
   her taxes. Everything here is read from utils/insights + accounting. */
export function Reports() {
  const { sales, payments, expenses, projects, contacts, events } = useApp();
  const { showSuccess, showToast } = useToast();
  const [period, setPeriod] = useState<Period>(() => currentPeriod("year"));
  const range = periodRange(period);
  const monthsInSpan = period.span === "year" ? 12 : period.span === "quarter" ? 3 : 1;
  const previous = periodRange({ ...period, anchor: addMonths(period.anchor, -monthsInSpan) });

  const summary = useMemo(() => periodSummary(sales, payments, expenses, range.from, range.to), [sales, payments, expenses, range.from, range.to]);
  const prior = useMemo(() => periodSummary(sales, payments, expenses, previous.from, previous.to), [sales, payments, expenses, previous.from, previous.to]);
  const trend = useMemo(() => monthlyTrend(sales, payments, expenses, range.to, monthsInSpan), [sales, payments, expenses, range.to, monthsInSpan]);
  const income = useMemo(() => incomeByCategory(sales, payments, range.from, range.to), [sales, payments, range.from, range.to]);
  const spend = useMemo(() => expenseBreakdown(expenses, range.from, range.to), [expenses, range.from, range.to]);
  const mediums = useMemo(() => salesByMedium(sales, payments, projects, range.from, range.to), [sales, payments, projects, range.from, range.to]);
  const clients = useMemo(() => topClients(sales, payments, contacts, range.from, range.to), [sales, payments, contacts, range.from, range.to]);
  const funnel = useMemo(() => leadFunnel(contacts, range.from, range.to), [contacts, range.from, range.to]);
  const daysToCollect = useMemo(() => avgDaysToCollect(sales, payments, range.from, range.to), [sales, payments, range.from, range.to]);

  const empty = summary.income === 0 && summary.expenses === 0 && summary.salesCount === 0;
  const currentMonth = todayISO().slice(0, 7);
  const best = bestMonths(trend, 3).filter((m) => m.net > 0);

  function exportAll() {
    haptic.tap();
    const tag = `${range.from}_${range.to}`;
    const ok =
      downloadCsv(`angus-ventas-${tag}.csv`, salesCsv(sales, payments, contacts, projects, range.from, range.to)) &&
      downloadCsv(`angus-pagos-${tag}.csv`, paymentsCsv(payments, sales, contacts, range.from, range.to)) &&
      downloadCsv(`angus-gastos-${tag}.csv`, expensesCsv(expenses, projects, events, range.from, range.to));
    if (ok) showSuccess("Tres archivos CSV descargados");
    else showToast("Tu navegador no permitió la descarga.", "error");
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">{range.label}</div>
        <h1 className="page-title">Reportes</h1>
      </div>

      <PeriodPicker value={period} onChange={setPeriod} ariaLabel="Periodo del reporte" />

      {empty ? (
        <div className="section">
          <div className="card">
            <EmptyState
              icon="chart"
              title={`Nada que contar en ${range.label.toLowerCase()}`}
              body="Cuando registres ventas, pagos o gastos en este periodo, aquí verás de dónde vino el dinero y a dónde fue."
            />
          </div>
        </div>
      ) : (
        <>
          <div className="section" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <div className="report-kpis">
              <Kpi label="Cobrado" value={formatMXNShort(summary.income)} d={delta(summary.income, prior.income)} upIsGood />
              <Kpi label="Gastado" value={formatMXNShort(summary.expenses)} d={delta(summary.expenses, prior.expenses)} upIsGood={false} />
              <Kpi label="Neto" value={formatMXNShortSigned(summary.net)} d={delta(summary.net, prior.net)} upIsGood />
              <Kpi
                label="Piezas vendidas"
                value={String(summary.piecesSold)}
                d={delta(summary.piecesSold, prior.piecesSold)}
                upIsGood
                plain
                sub={summary.avgPiecePrice ? `precio promedio ${formatMXNShort(summary.avgPiecePrice)}` : undefined}
              />
            </div>
          </div>

          {monthsInSpan > 1 && (
            <div className="section">
              <div className="section-header">
                <span className="section-title">Mes a mes</span>
              </div>
              <div className="card" style={{ padding: "14px 16px 12px" }}>
                <BarChart
                  series={[
                    { key: "in", label: "Cobrado", color: "var(--green)" },
                    { key: "out", label: "Gastado", color: "var(--red)" }
                  ]}
                  columns={trend.map((p) => ({
                    key: p.month,
                    label: monthInitial(p.month),
                    title: formatMonthLong(p.month),
                    values: { in: p.income, out: p.expenses },
                    current: p.month === currentMonth
                  }))}
                  ariaLabel={`Cobrado y gastado por mes en ${range.label}`}
                />
                {best.length > 0 && (
                  <div className="input-help" style={{ marginTop: 10 }}>
                    {best.length === 1 ? "Tu mejor mes fue " : "Tus mejores meses fueron "}
                    {best.map((m) => `${monthName(m.month)} (${formatMXNShortSigned(m.net)})`).join(", ")}.
                  </div>
                )}
              </div>
            </div>
          )}

          <Breakdown
            title="De dónde vino"
            rows={income.map((r) => ({
              id: r.category,
              label: labelFor(INCOME_CATEGORY, r.category),
              badge: INCOME_CATEGORY_BADGE[r.category as IncomeCategory] ?? "badge-gray",
              amount: r.amount,
              share: r.share
            }))}
            emptyBody="Sin cobros en el periodo."
          />
          <Breakdown
            title="A dónde fue"
            rows={spend.map((r) => ({
              id: r.category,
              label: labelFor(EXPENSE_CATEGORY, r.category),
              badge: EXPENSE_CATEGORY_BADGE[r.category as ExpenseCategory] ?? "badge-gray",
              amount: r.amount,
              share: r.share
            }))}
            emptyBody="Sin gastos en el periodo."
          />

          {mediums.length > 0 && (
            <Ranked title="Por medio" rows={mediums} unit={(r) => `${r.count} ${r.count === 1 ? "venta" : "ventas"}`} />
          )}
          {clients.length > 0 && (
            <Ranked title="Quién compró" rows={clients} unit={(r) => `${r.count} ${r.count === 1 ? "venta" : "ventas"}`} />
          )}

          <div className="section">
            <div className="section-header">
              <span className="section-title">Prospectos y cobros</span>
            </div>
            <div className="card">
              <div className="money-stats" style={{ padding: 14 }}>
                <div>
                  <div className="money-stat-label">Ganados</div>
                  <div className="money-stat-value money-stat-value--paid">{funnel.won}</div>
                </div>
                <div>
                  <div className="money-stat-label">Perdidos</div>
                  <div className="money-stat-value">{funnel.lost}</div>
                </div>
                <div>
                  <div className="money-stat-label">Conversión</div>
                  <div className="money-stat-value">{funnel.conversion === null ? "—" : `${funnel.conversion}%`}</div>
                </div>
              </div>
              <div className="input-help" style={{ padding: "0 14px 14px", marginTop: 0 }}>
                {funnel.open > 0 ? `${funnel.open} ${funnel.open === 1 ? "prospecto abierto" : "prospectos abiertos"} · ` : ""}
                {daysToCollect === null
                  ? "Aún no hay ventas liquidadas para medir cuánto tardas en cobrar."
                  : `Tardas en promedio ${daysToCollect} ${daysToCollect === 1 ? "día" : "días"} en cobrar una venta completa.`}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="section">
        <div className="section-header">
          <span className="section-title">Exportar</span>
        </div>
        <div className="card">
          <button type="button" className="row-item" onClick={exportAll}>
            <span className="settings-row-icon">
              <Icon name="download" size={18} />
            </span>
            <div className="row-content">
              <div className="row-title">Descargar CSV · {range.label}</div>
              <div className="row-sub">Ventas, pagos y gastos, listos para Excel o tu contador.</div>
            </div>
            <span className="row-chevron" aria-hidden="true">
              <Icon name="chevron-right" size={16} />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  d,
  upIsGood,
  plain,
  sub
}: {
  label: string;
  value: string;
  d: Delta;
  upIsGood: boolean;
  plain?: boolean;
  sub?: string;
}) {
  const dir = d.change > 0 ? "up" : d.change < 0 ? "down" : "flat";
  const good = dir === "flat" ? "" : (dir === "up") === upIsGood ? "report-kpi-delta--up" : "report-kpi-delta--down";
  const text =
    dir === "flat"
      ? "igual que antes"
      : `${dir === "up" ? "▲" : "▼"} ${plain ? Math.abs(d.change) : formatMXNShort(Math.abs(d.change))}${
          d.percent !== null ? ` (${Math.abs(d.percent)}%)` : ""
        } vs. periodo anterior`;
  return (
    <div className="report-kpi">
      <div className="report-kpi-label">{label}</div>
      <div className="report-kpi-value">{value}</div>
      <div className={`report-kpi-delta ${good}`}>{sub ? `${sub} · ` : ""}{text}</div>
    </div>
  );
}

function Breakdown({
  title,
  rows,
  emptyBody
}: {
  title: string;
  rows: { id: string; label: string; badge: string; amount: number; share: number }[];
  emptyBody: string;
}) {
  return (
    <div className="section">
      <div className="section-header">
        <span className="section-title">{title}</span>
      </div>
      <div className="card money-summary">
        {rows.length === 0 ? (
          <div className="input-help" style={{ marginTop: 0 }}>{emptyBody}</div>
        ) : (
          rows.map((r) => (
            <div className="cat-bar-row" key={r.id}>
              <span className="cat-bar-label">
                <span className={`badge ${r.badge}`}>{r.label}</span>
              </span>
              <span className="cat-bar-track">
                <span className="cat-bar-fill" style={{ width: `${r.share * 100}%` }} />
              </span>
              <span className="cat-bar-value">{formatMXNShort(r.amount)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Ranked({ title, rows, unit }: { title: string; rows: RankedRow[]; unit: (r: RankedRow) => string }) {
  return (
    <div className="section">
      <div className="section-header">
        <span className="section-title">{title}</span>
      </div>
      <div className="card">
        {rows.map((r, i) => (
          <div className="rank-row" key={r.id}>
            <span className="rank-index">{i + 1}</span>
            <div className="rank-main">
              <div className="rank-label">{r.label}</div>
              <div className="rank-sub">
                {unit(r)} · {Math.round(r.share * 100)}%
              </div>
            </div>
            <span className="rank-amount">{formatMXN(r.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
