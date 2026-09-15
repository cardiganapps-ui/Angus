import { useEffect, useState, type ReactNode } from "react";
import type { Route } from "../hooks/useNavigation";

/* ── LoadingSkeleton ──
   First paint while auth / data resolves. Mirrors the destination
   layout (page header, then per route: 2-up KPI tiles + a card of
   rows for Home, a card of rows for the list screens, two sections
   for Agenda) with .sk-bar / .sk-circle shimmer bars so the
   transition to real content feels continuous — never a bare
   "Cargando…" string. The shimmer pauses under prefers-reduced-motion
   via responsive.css. */
export function LoadingSkeleton({ route = "home" }: { route?: Route }) {
  return (
    <div className="page" aria-busy="true" aria-label="Cargando">
      <div className="page-header">
        <span className="sk-bar sk-bar-xs" style={{ width: 90 }} />
        <span className="sk-bar sk-bar-lg" style={{ width: 140, marginTop: 6 }} />
      </div>
      {route === "home" && (
        <div className="kpi-grid">
          {[0, 1].map((i) => (
            <div className="kpi-card" key={i}>
              <span className="sk-bar sk-bar-xs" style={{ width: "60%", marginBottom: 10 }} />
              <span className="sk-bar sk-bar-lg" style={{ width: 44 }} />
            </div>
          ))}
        </div>
      )}
      <SkeletonRows header={route === "home" || route === "schedule"} count={route === "home" ? 3 : 5} dot={route !== "contacts"} />
      {route === "schedule" && <SkeletonRows header count={2} dot />}
    </div>
  );
}

function SkeletonRows({ header, count, dot }: { header: boolean; count: number; dot: boolean }) {
  return (
    <div className="section">
      {header && (
        <div className="section-header">
          <span className="sk-bar sk-bar-md" style={{ width: 120 }} />
        </div>
      )}
      <div className="card">
        {Array.from({ length: count }, (_, i) => (
          <div className="row-item" key={i} style={{ cursor: "default" }}>
            {dot && <span className="sk-circle" style={{ width: 8, height: 8 }} />}
            <div className="row-content" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="sk-bar sk-bar-md" style={{ width: `${62 - (i % 3) * 8}%` }} />
              <span className="sk-bar sk-bar-xs" style={{ width: `${44 + (i % 3) * 6}%` }} />
            </div>
            <span className="sk-bar sk-bar-sm" style={{ width: 52, borderRadius: 100 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── SkeletonCrossfade ──
   Wraps the first-load swap from LoadingSkeleton → real content with
   a 250ms crossfade so the transition doesn't read as a hard cut.
   When `showContent` flips true, both layers remain mounted for the
   fade duration: content fades in from 0 while the skeleton fades out
   on top, giving the eye a continuous handoff. */
export function SkeletonCrossfade({ showContent, route, children }: {
  showContent: boolean;
  route?: Route;
  children: ReactNode;
}) {
  const [keepSkeleton, setKeepSkeleton] = useState(!showContent);
  useEffect(() => {
    if (showContent && keepSkeleton) {
      const id = setTimeout(() => setKeepSkeleton(false), 260);
      return () => clearTimeout(id);
    }
    // Re-raise the skeleton when the app transitions back to loading
    // (rare — a userId swap re-arms the stores). The set is synchronous
    // in the effect on purpose: the skeleton needs to be visible in
    // the same frame we lose the content.
    if (!showContent && !keepSkeleton) setKeepSkeleton(true);
  }, [showContent, keepSkeleton]);

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {showContent && (
        <div style={{
          flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
          animation: keepSkeleton ? "fadeIn var(--dur-base) ease" : undefined,
        }}>
          {children}
        </div>
      )}
      {keepSkeleton && (
        <div style={{
          position: showContent ? "absolute" : "static",
          inset: 0,
          flex: showContent ? undefined : 1,
          minHeight: 0,
          display: "flex", flexDirection: "column",
          animation: showContent ? "fadeOut var(--dur-base) ease forwards" : undefined,
          pointerEvents: showContent ? "none" : undefined,
        }}>
          <LoadingSkeleton route={route} />
        </div>
      )}
    </div>
  );
}
