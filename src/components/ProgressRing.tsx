import type { ReactNode } from "react";

/* ── ProgressRing ──
   One-series meter: a track and a fill drawn as SVG arcs, the label in
   the middle. Fill color is a token passed by the caller (accent for a
   goal, a status color for a budget). The stroke animates via CSS
   (`.ring-fill`), paused under reduced motion. */
export function ProgressRing({
  ratio,
  size = 72,
  stroke = 7,
  color = "var(--accent)",
  label,
  children
}: {
  ratio: number; // 0..1
  size?: number;
  stroke?: number;
  color?: string;
  label: string; // accessible summary
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, ratio));
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className="ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          stroke={color}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {children && <div className="ring-label">{children}</div>}
    </div>
  );
}
