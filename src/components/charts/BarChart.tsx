import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { formatMXNShort, formatMXNShortSigned, toCents } from "../../utils/money";
import { haptic } from "../../lib/haptics";

/* ── BarChart ──
   Grouped columns over a shared scale, drawn as one SVG so the marks can
   have real rounded caps, a depth gradient and a hatch for what hasn't
   happened yet. Gridline values sit inline above their lines (no axis
   gutter — the bars get the full width). Tap a column to read it; a
   legend is drawn for ≥ 2 series or when anything is projected, and a
   visually hidden table carries the numbers for screen readers. */

export interface ChartSeries {
  key: string;
  label: string;
  color: string; // a CSS token, e.g. "var(--green)"
  /** Used instead of `color` when the value is negative (net charts). */
  negColor?: string;
}

export interface ChartColumn {
  key: string;
  label: string; // axis label ("S", "Oct")
  title: string; // read-out title ("Septiembre 2026")
  values: Record<string, number>;
  projected?: boolean;
  current?: boolean;
}

const PAD_TOP = 16; // room for the top gridline's value
const BAR_MAX = 18;
const BAR_GAP = 3;
const MIN_BAR = 2;

function niceCeil(cents: number): number {
  if (cents <= 0) return 0;
  const pow = Math.pow(10, Math.floor(Math.log10(cents)));
  const n = cents / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

/* A column with a rounded data-end and a square baseline. `y0` is the
   baseline, `y1` the data end; works for both directions. */
function barPath(x: number, w: number, y0: number, y1: number): string {
  const up = y1 < y0;
  const h = Math.abs(y0 - y1);
  const r = Math.min(4, w / 2, h / 2);
  if (up) {
    return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + r} V${y0} Z`;
  }
  return `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 - r} V${y0} Z`;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => setWidth(el.clientWidth);
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

export function BarChart({
  series,
  columns,
  height = 150,
  ariaLabel,
  signed = false,
  labelCurrent = false
}: {
  series: ChartSeries[];
  columns: ChartColumn[];
  height?: number;
  ariaLabel: string;
  /** Values can be negative (net); otherwise the scale starts at 0. */
  signed?: boolean;
  /** Single series: print the current column's value on its cap. */
  labelCurrent?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const { ref, width } = useWidth<HTMLDivElement>();
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
    return { top, bottom, span: top - bottom };
  }, [columns, series, signed]);

  const fmt = signed ? formatMXNShortSigned : formatMXNShort;
  const plotH = height - PAD_TOP;
  const yFor = (cents: number) =>
    scale.span === 0 ? height : PAD_TOP + ((scale.top - cents) / scale.span) * plotH;
  const yZero = yFor(0);
  const gridValues = scale.span === 0 ? [] : [scale.top, scale.top / 2].filter((v) => v > 0);
  const openCol = columns.find((c) => c.key === open) ?? null;
  const hasProjected = columns.some((c) => c.projected);

  // Inset the columns by the longest gridline value so the first bar
  // never sits under a label; the lines themselves stay full width.
  const labelChars = Math.max(
    0,
    ...gridValues.map((v) => fmt(v / 100).length),
    scale.bottom < 0 ? fmt(scale.bottom / 100).length : 0,
    scale.span > 0 && scale.bottom < 0 ? 2 : 0
  );
  const padL = labelChars ? Math.round(labelChars * 6.4) + 8 : 0;
  const slot = columns.length ? (width - padL) / columns.length : 0;
  const n = series.length;
  const barW = Math.max(4, Math.min(BAR_MAX, (slot * 0.72 - BAR_GAP * (n - 1)) / n));
  const groupW = barW * n + BAR_GAP * (n - 1);

  const colorFor = (s: ChartSeries, v: number) => (v < 0 && s.negColor ? s.negColor : s.color);

  return (
    <div className="chart">
      <div className="chart-plot" ref={ref} style={{ height }}>
        {width > 0 && (
          <svg
            className="chart-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={ariaLabel}
          >
            <defs>
              {series.map((s) => {
                const colors = s.negColor ? [s.color, s.negColor] : [s.color];
                return colors.map((color, ci) => (
                  <g key={`${s.key}-${ci}`}>
                    <linearGradient id={`g-${uid}-${s.key}-${ci}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" style={{ stopColor: color, stopOpacity: 1 }} />
                      <stop offset="1" style={{ stopColor: color, stopOpacity: 0.74 }} />
                    </linearGradient>
                    <pattern
                      id={`h-${uid}-${s.key}-${ci}`}
                      width="5"
                      height="5"
                      patternUnits="userSpaceOnUse"
                      patternTransform="rotate(45)"
                    >
                      <rect width="5" height="5" style={{ fill: color, fillOpacity: 0.16 }} />
                      <line x1="0" y1="0" x2="0" y2="5" style={{ stroke: color, strokeOpacity: 0.7 }} strokeWidth="1.4" />
                    </pattern>
                  </g>
                ));
              })}
            </defs>

            {/* Column bands: the month she's in, and the one she tapped. */}
            {columns.map((col, i) =>
              col.current || open === col.key ? (
                <rect
                  key={`band-${col.key}`}
                  className={`chart-band ${open === col.key ? "chart-band--open" : ""}`}
                  x={padL + slot * i + 2}
                  y={4}
                  width={Math.max(0, slot - 4)}
                  height={height - 4}
                  rx={8}
                />
              ) : null
            )}

            {/* Gridlines with their values riding just above. */}
            {gridValues.map((v) => (
              <g key={v}>
                <line className="chart-gridline" x1={0} x2={width} y1={yFor(v)} y2={yFor(v)} />
                <text className="chart-gridtext" x={2} y={yFor(v) - 4}>
                  {fmt(v / 100)}
                </text>
              </g>
            ))}
            {scale.bottom < 0 && (
              <g>
                <line className="chart-gridline" x1={0} x2={width} y1={height} y2={height} />
                <text className="chart-gridtext" x={2} y={height - 4}>
                  {fmt(scale.bottom / 100)}
                </text>
              </g>
            )}
            <line className="chart-gridline chart-gridline--zero" x1={0} x2={width} y1={yZero} y2={yZero} />
            {scale.span > 0 && scale.bottom < 0 && (
              <text className="chart-gridtext" x={2} y={yZero - 4}>
                $0
              </text>
            )}

            {/* Bars. */}
            {columns.map((col, ci) => {
              const gx = padL + slot * ci + (slot - groupW) / 2;
              return series.map((s, si) => {
                const v = toCents(col.values[s.key] ?? 0);
                if (scale.span === 0 || v === 0) return null;
                const x = gx + si * (barW + BAR_GAP);
                let y1 = yFor(v);
                if (Math.abs(y1 - yZero) < MIN_BAR) y1 = v > 0 ? yZero - MIN_BAR : yZero + MIN_BAR;
                const ci2 = v < 0 && s.negColor ? 1 : 0;
                const fill = col.projected ? `url(#h-${uid}-${s.key}-${ci2})` : `url(#g-${uid}-${s.key}-${ci2})`;
                const dim = !col.current && !col.projected && open !== null && open !== col.key;
                return (
                  <path
                    key={`${col.key}-${s.key}`}
                    className={`chart-bar ${v < 0 ? "chart-bar--neg" : ""} ${dim ? "chart-bar--dim" : ""}`}
                    style={{ "--i": ci, "--y0": `${yZero}px` } as CSSProperties}
                    d={barPath(x, barW, yZero, y1)}
                    fill={fill}
                  />
                );
              });
            })}

            {/* One direct label: the current column's value (single series). */}
            {labelCurrent &&
              n === 1 &&
              scale.span > 0 &&
              columns.map((col, ci) => {
                if (!col.current) return null;
                const v = toCents(col.values[series[0].key] ?? 0);
                const y = yFor(v);
                const cx = padL + slot * ci + slot / 2;
                return (
                  <text
                    key={`lbl-${col.key}`}
                    className="chart-captext"
                    x={cx}
                    y={v >= 0 ? y - 5 : y + 12}
                    textAnchor="middle"
                    style={{ fill: v === 0 ? "var(--charcoal-md)" : colorFor(series[0], v) }}
                  >
                    {fmt(v / 100)}
                  </text>
                );
              })}

            {/* Hit areas. */}
            {columns.map((col, i) => (
              <rect
                key={`hit-${col.key}`}
                className="chart-hit"
                x={padL + slot * i}
                y={0}
                width={slot}
                height={height}
                role="button"
                tabIndex={0}
                aria-label={`${col.title}: ${series.map((s) => `${s.label} ${fmt(col.values[s.key] ?? 0)}`).join(", ")}`}
                aria-pressed={open === col.key}
                onClick={() => {
                  haptic.tap();
                  setOpen((o) => (o === col.key ? null : col.key));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpen((o) => (o === col.key ? null : col.key));
                  }
                }}
              />
            ))}
          </svg>
        )}
      </div>

      <div className="chart-labels" aria-hidden="true" style={{ paddingLeft: padL }}>
        {columns.map((col) => (
          <span key={col.key} className={`chart-label ${col.current ? "chart-label--current" : ""}`}>
            {col.label}
          </span>
        ))}
      </div>

      {(n > 1 || hasProjected) && (
        <div className="chart-legend" aria-hidden="true">
          {series.map((s) => (
            <span className="chart-legend-item" key={s.key}>
              <span className="chart-swatch" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
          {hasProjected && (
            <span className="chart-legend-item">
              <svg className="chart-swatch" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <defs>
                  <pattern id={`h-${uid}-legend`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="4" height="4" style={{ fill: "var(--charcoal-lt)", fillOpacity: 0.18 }} />
                    <line x1="0" y1="0" x2="0" y2="4" style={{ stroke: "var(--charcoal-lt)" }} strokeWidth="1.2" />
                  </pattern>
                </defs>
                <rect width="10" height="10" rx="3" fill={`url(#h-${uid}-legend)`} />
              </svg>
              Proyectado
            </span>
          )}
        </div>
      )}

      {openCol && (
        <div className="chart-readout" role="status">
          <span className="chart-readout-title">
            {openCol.title}
            {openCol.projected ? <span className="chart-readout-tag">proyectado</span> : null}
          </span>
          <span className="chart-readout-values">
            {series.map((s) => {
              const v = openCol.values[s.key] ?? 0;
              return (
                <span key={s.key} className="chart-readout-value">
                  <span className="chart-swatch" style={{ background: colorFor(s, v) }} />
                  {n > 1 ? `${s.label} ` : ""}
                  <strong>{fmt(v)}</strong>
                </span>
              );
            })}
          </span>
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
