import { useMemo, useState, type CSSProperties } from "react";
import { formatMXNShort, formatMXNShortSigned, toCents } from "../../utils/money";
import { haptic } from "../../lib/haptics";

/* ── BarChart ──
   Grouped columns over a shared scale with a zero line. Each column has
   one value per series; a column may be flagged `projected` (washed
   fill + dashed outline) and `current`. Tap a column to read its values
   (touch has no hover). A legend is always drawn for ≥ 2 series, and a
   visually hidden table carries the data for screen readers. */

export interface ChartSeries {
  key: string;
  label: string;
  color: string; // a CSS token, e.g. "var(--green)"
  washColor?: string; // the --*-bg step, used for projected columns
}

export interface ChartColumn {
  key: string;
  label: string; // axis label ("S", "Oct")
  title: string; // read-out title ("Septiembre 2026")
  values: Record<string, number>;
  projected?: boolean;
  current?: boolean;
}

function niceCeil(cents: number): number {
  if (cents <= 0) return 0;
  const pow = Math.pow(10, Math.floor(Math.log10(cents)));
  const n = cents / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

export function BarChart({
  series,
  columns,
  height = 140,
  ariaLabel,
  signed = false
}: {
  series: ChartSeries[];
  columns: ChartColumn[];
  height?: number;
  ariaLabel: string;
  /** Values can be negative (net); otherwise the scale starts at 0. */
  signed?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const scale = useMemo(() => {
    let max = 0;
    let min = 0;
    for (const c of columns) {
      for (const s of series) {
        const v = toCents(c.values[s.key] ?? 0);
        if (v > max) max = v;
        if (v < min) min = v;
      }
    }
    const top = niceCeil(max);
    const bottom = signed ? -niceCeil(-min) : 0;
    const span = top - bottom;
    return { top, bottom, span, zero: span === 0 ? 1 : top / span };
  }, [columns, series, signed]);

  const fmt = signed ? formatMXNShortSigned : formatMXNShort;
  const gridlines = scale.span === 0 ? [] : [scale.top, scale.top / 2].filter((v) => v > 0);
  const openCol = columns.find((c) => c.key === open) ?? null;

  return (
    <div>
      <div className="chart" style={{ "--chart-h": `${height}px` } as CSSProperties}>
        <div className="chart-axis" aria-hidden="true">
          {gridlines.map((v) => (
            <span key={v} style={{ top: `${((scale.top - v) / scale.span) * 100}%` }}>
              {fmt(v / 100)}
            </span>
          ))}
          {scale.span > 0 && <span style={{ top: `${scale.zero * 100}%` }}>$0</span>}
          {scale.bottom < 0 && <span style={{ top: "100%" }}>{fmt(scale.bottom / 100)}</span>}
        </div>
        <div className="chart-plot">
          <div className="chart-grid" role="img" aria-label={ariaLabel}>
            {gridlines.map((v) => (
              <span key={v} className="chart-gridline" style={{ top: `${((scale.top - v) / scale.span) * 100}%` }} />
            ))}
            <span className="chart-gridline chart-gridline--zero" style={{ top: `${scale.zero * 100}%` }} />
            {columns.map((col) => (
              <button
                type="button"
                key={col.key}
                className={`chart-col ${col.current ? "chart-col--current" : ""} ${open === col.key ? "chart-col--open" : ""}`}
                style={{ "--series": series.length } as CSSProperties}
                aria-label={`${col.title}: ${series.map((s) => `${s.label} ${fmt(col.values[s.key] ?? 0)}`).join(", ")}`}
                onClick={() => {
                  haptic.tap();
                  setOpen((o) => (o === col.key ? null : col.key));
                }}
              >
                {series.map((s, i) => {
                  const v = toCents(col.values[s.key] ?? 0);
                  if (scale.span === 0 || v === 0) return null;
                  const h = (Math.abs(v) / scale.span) * 100;
                  const slot = 100 / series.length;
                  const left = `calc(${slot * i}% + ${slot / 2}% - min(11px, (100% - 6px) / ${series.length} / 2))`;
                  const style: CSSProperties = {
                    left,
                    height: `${h}%`,
                    background: col.projected ? (s.washColor ?? s.color) : s.color,
                    color: s.color
                  };
                  if (v >= 0) style.top = `${(scale.zero - h / 100) * 100}%`;
                  else style.top = `${scale.zero * 100}%`;
                  return (
                    <span
                      key={s.key}
                      className={`chart-bar ${v < 0 ? "chart-bar--neg" : ""} ${col.projected ? "chart-bar--projected" : ""}`}
                      style={style}
                    />
                  );
                })}
              </button>
            ))}
          </div>
          <div className="chart-labels" aria-hidden="true">
            {columns.map((col) => (
              <span key={col.key} className={`chart-label ${col.current ? "chart-label--current" : ""}`}>
                {col.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {(series.length > 1 || columns.some((c) => c.projected)) && (
        <div className="chart-legend" aria-hidden="true">
          {series.map((s) => (
            <span className="chart-legend-item" key={s.key}>
              <span className="chart-swatch" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
          {columns.some((c) => c.projected) && (
            <span className="chart-legend-item">
              <span className="chart-swatch chart-swatch--projected" style={{ background: "var(--cream-dark)", color: "var(--charcoal-lt)" }} />
              Proyectado
            </span>
          )}
        </div>
      )}

      {openCol && (
        <div className="chart-readout" role="status">
          <span className="chart-readout-title">
            {openCol.title}
            {openCol.projected ? " · proyectado" : ""}
          </span>
          {series.map((s) => (
            <span key={s.key}>
              {s.label} <strong>{fmt(openCol.values[s.key] ?? 0)}</strong>
            </span>
          ))}
        </div>
      )}

      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th>Periodo</th>
            {series.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columns.map((c) => (
            <tr key={c.key}>
              <td>{c.title}</td>
              {series.map((s) => (
                <td key={s.key}>{fmt(c.values[s.key] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
