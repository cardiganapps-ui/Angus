/* ── LoadingSkeleton ──
   First paint while auth / data resolves. Mirrors the Home layout
   (page header, 2-up KPI tiles, a card of rows) with .sk-bar /
   .sk-circle shimmer bars so the transition to real content feels
   continuous — never a bare "Cargando…" string. The shimmer pauses
   under prefers-reduced-motion via responsive.css. */
export function LoadingSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Cargando">
      <div className="page-header">
        <span className="sk-bar sk-bar-xs" style={{ width: 90 }} />
        <span className="sk-bar sk-bar-lg" style={{ width: 140, marginTop: 6 }} />
      </div>
      <div className="kpi-grid">
        {[0, 1].map((i) => (
          <div className="kpi-card" key={i}>
            <span className="sk-bar sk-bar-xs" style={{ width: "60%", marginBottom: 10 }} />
            <span className="sk-bar sk-bar-lg" style={{ width: 44 }} />
          </div>
        ))}
      </div>
      <div className="section">
        <div className="section-header">
          <span className="sk-bar sk-bar-md" style={{ width: 120 }} />
        </div>
        <div className="card">
          {[0, 1, 2].map((i) => (
            <div className="row-item" key={i} style={{ cursor: "default" }}>
              <span className="sk-circle" style={{ width: 8, height: 8 }} />
              <div className="row-content" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="sk-bar sk-bar-md" style={{ width: `${62 - i * 8}%` }} />
                <span className="sk-bar sk-bar-xs" style={{ width: `${44 + i * 6}%` }} />
              </div>
              <span className="sk-bar sk-bar-sm" style={{ width: 52, borderRadius: 100 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
