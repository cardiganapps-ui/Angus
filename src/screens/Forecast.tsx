import { useMemo } from "react";
import { useApp } from "../context/AppContext";
import type { Route } from "../hooks/useNavigation";
import { forecast, forecastNet } from "../utils/forecast";
import { monthlyTrend } from "../utils/dashboard";
import { formatMXN, formatMXNShort, formatMXNShortSigned } from "../utils/money";
import { formatMonthLong, monthInitial, monthName, todayISO } from "../utils/dates";
import { BarChart, type ChartColumn } from "../components/charts/BarChart";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { haptic } from "../lib/haptics";

const PAST = 3;
const AHEAD = 6;

const SERIES = [
  { key: "in", label: "Entra", color: "var(--green)", washColor: "var(--green-bg)" },
  { key: "out", label: "Sale", color: "var(--red)", washColor: "var(--red-bg)" }
];

/* ── Pronóstico ──
   The next six months, honestly labeled: what is committed, what is
   recurring, what is only an average. The chart shows three real months
   behind for context, then the projection washed and dashed. */
export function Forecast({ navigate }: { navigate: (r: Route) => void }) {
  const { sales, payments, installments, expenses, rules } = useApp();
  const today = todayISO();
  const currentMonth = today.slice(0, 7);

  const f = useMemo(
    () => forecast({ sales, payments, installments, expenses, rules, today, months: AHEAD }),
    [sales, payments, installments, expenses, rules, today]
  );
  const past = useMemo(
    () => monthlyTrend(sales, payments, expenses, today, PAST + 1).slice(0, PAST),
    [sales, payments, expenses, today]
  );
  const net = forecastNet(f.months);

  const columns: ChartColumn[] = [
    ...past.map((p) => ({
      key: p.month,
      label: monthInitial(p.month),
      title: formatMonthLong(p.month),
      values: { in: p.income, out: p.expenses }
    })),
    ...f.months.map((m) => ({
      key: m.month,
      label: monthInitial(m.month),
      title: formatMonthLong(m.month),
      values: { in: m.projectedIn, out: m.projectedOut },
      projected: true,
      current: m.month === currentMonth
    }))
  ];

  const heroClass = net.projected < 0 ? "forecast-hero-value--neg" : net.projected > 0 ? "forecast-hero-value--pos" : "";
  const go = (r: Route) => {
    haptic.tap();
    navigate(r);
  };

  // Nothing to project from yet: say what feeds the forecast instead of
  // drawing an empty chart of zeros.
  if (sales.length === 0 && expenses.length === 0 && rules.length === 0) {
    return (
      <div className="page">
        <div className="page-header">
          <div className="eyebrow">Próximos {AHEAD} meses</div>
          <h1 className="page-title">Pronóstico</h1>
        </div>
        <div className="section">
          <div className="card">
            <EmptyState
              icon="trending"
              title="Aún no hay nada que proyectar"
              body="El pronóstico se arma con tus ventas por cobrar, tus ingresos y gastos fijos y el promedio de lo que gastas. Empieza por uno."
            />
          </div>
        </div>
        <div className="section">
          <div className="card">
            <button type="button" className="row-item" onClick={() => go("recurring")}>
              <div className="row-content">
                <div className="row-title">Agregar un ingreso o gasto fijo</div>
                <div className="row-sub">Renta, colegiaturas, apps: lo que se repite cada mes.</div>
              </div>
              <span className="row-chevron" aria-hidden="true">
                <Icon name="chevron-right" size={16} />
              </span>
            </button>
            <button type="button" className="row-item" onClick={() => go("money")}>
              <div className="row-content">
                <div className="row-title">Registrar una venta o un gasto</div>
                <div className="row-sub">Lo que te deben ya cuenta como comprometido.</div>
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

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">Próximos {AHEAD} meses</div>
        <h1 className="page-title">Pronóstico</h1>
      </div>

      <div className="section">
        <div className="card forecast-hero">
          <div className="forecast-hero-label">Te quedaría en {AHEAD} meses</div>
          <div className={`forecast-hero-value ${heroClass}`}>{formatMXNShortSigned(net.projected)}</div>
          <div className="forecast-hero-sub">
            Solo con lo ya comprometido y lo recurrente: <strong>{formatMXNShortSigned(net.committed)}</strong>.
            {f.runway && (
              <>
                {" "}
                El acumulado se vuelve negativo en {monthName(f.runway)}.
              </>
            )}
          </div>
        </div>
      </div>

      {f.runway && (
        <div className="forecast-runway">
          <span className="icon">
            <Icon name="alert" size={18} strokeWidth={2} />
          </span>
          <span>
            Con estas suposiciones, a partir de {monthName(f.runway)} habrías gastado más de lo que entra. Un ingreso
            fijo nuevo o menos gasto variable lo cambia.
          </span>
        </div>
      )}

      <div className="section">
        <div className="section-header">
          <span className="section-title">Entra y sale</span>
          <span className="eyebrow">Últimos {PAST} · próximos {AHEAD}</span>
        </div>
        <div className="card" style={{ padding: "14px 16px 12px" }}>
          <BarChart
            series={SERIES}
            columns={columns}
            ariaLabel={`Entradas y salidas por mes, ${PAST} pasados y ${AHEAD} proyectados`}
          />
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-title">Mes por mes</span>
        </div>
        <div className="card">
          {f.months.map((m) => (
            <div className="forecast-month" key={m.month}>
              <div className="forecast-month-head">
                <span className="forecast-month-title">{formatMonthLong(m.month)}</span>
                <span
                  className="forecast-month-net"
                  style={{ color: m.projectedNet < 0 ? "var(--red)" : m.projectedNet > 0 ? "var(--green)" : "var(--charcoal)" }}
                >
                  {formatMXNShortSigned(m.projectedNet)}
                </span>
              </div>
              <div className="forecast-lines">
                {m.actualIn > 0 && (
                  <>
                    <span>Ya entró</span>
                    <b>{formatMXNShort(m.actualIn)}</b>
                  </>
                )}
                {m.committedIn > 0 && (
                  <>
                    <span>Te deben (comprometido)</span>
                    <b>{formatMXNShort(m.committedIn)}</b>
                  </>
                )}
                {m.recurringIn > 0 && (
                  <>
                    <span>Ingresos fijos</span>
                    <b>{formatMXNShort(m.recurringIn)}</b>
                  </>
                )}
                {m.estimatedIn > 0 && (
                  <>
                    <span className="is-est">Ventas nuevas (estimado)</span>
                    <b>{formatMXNShort(m.estimatedIn)}</b>
                  </>
                )}
                {m.actualOut > 0 && (
                  <>
                    <span>Ya salió</span>
                    <b>−{formatMXNShort(m.actualOut)}</b>
                  </>
                )}
                {m.recurringOut > 0 && (
                  <>
                    <span>Gastos fijos</span>
                    <b>−{formatMXNShort(m.recurringOut)}</b>
                  </>
                )}
                {m.estimatedOut > 0 && (
                  <>
                    <span className="is-est">Gastos variables (estimado)</span>
                    <b>−{formatMXNShort(m.estimatedOut)}</b>
                  </>
                )}
                <span>Acumulado</span>
                <b>{formatMXNShortSigned(m.cumulative)}</b>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-title">En qué se basa</span>
        </div>
        <div className="card">
          <ul className="forecast-assumptions">
            {f.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-title">Qué lo cambiaría</span>
        </div>
        <div className="card">
          <button type="button" className="row-item" onClick={() => go("recurring")}>
            <div className="row-content">
              <div className="row-title">Revisar ingresos y gastos fijos</div>
              <div className="row-sub">
                Fijos al mes: entra {formatMXN(f.months[1]?.recurringIn ?? 0)} · sale{" "}
                {formatMXN(f.months[1]?.recurringOut ?? 0)}
              </div>
            </div>
            <span className="row-chevron" aria-hidden="true">
              <Icon name="chevron-right" size={16} />
            </span>
          </button>
          <button type="button" className="row-item" onClick={() => go("money")}>
            <div className="row-content">
              <div className="row-title">Cobrar lo pendiente</div>
              <div className="row-sub">Cada pago que registres mueve el comprometido a real.</div>
            </div>
            <span className="row-chevron" aria-hidden="true">
              <Icon name="chevron-right" size={16} />
            </span>
          </button>
          <button type="button" className="row-item" onClick={() => go("budgets")}>
            <div className="row-content">
              <div className="row-title">Ponerle límite a los variables</div>
              <div className="row-sub">Promedio actual: {formatMXN(f.averages.variableOut)} al mes.</div>
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
