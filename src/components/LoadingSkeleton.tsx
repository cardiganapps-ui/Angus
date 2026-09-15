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
      {/* Home leads with the greeting, every other screen with an eyebrow. */}
      <div className="page-header">
        {route === "home" ? (
          <>
            <span className="sk-bar sk-bar-lg" style={{ width: 150 }} />
            <span className="sk-bar sk-bar-sm" style={{ width: 190, marginTop: 6 }} />
          </>
        ) : (
          <>
            <span className="sk-bar sk-bar-xs" style={{ width: 90 }} />
            <span className="sk-bar sk-bar-lg" style={{ width: 140, marginTop: 6 }} />
          </>
        )}
      </div>
      {route === "home" && <SkeletonDashboard />}
      {route === "money" && (
        <div className="kpi-grid">
          {[0, 1].map((i) => (
            <div className="kpi-card" key={i}>
              <span className="sk-bar sk-bar-xs" style={{ width: "60%", marginBottom: 10 }} />
              <span className="sk-bar sk-bar-lg" style={{ width: 82 }} />
            </div>
          ))}
        </div>
      )}
      {/* Dinero's segmented control (Ventas | Gastos) sits above the list. */}
      {route === "money" && (
        <div className="section">
          <span className="sk-bar" style={{ display: "block", height: 40, borderRadius: 100 }} />
        </div>
      )}
      {(route === "recurring" || route === "budgets") && (
        <>
          <div className="section">
            <span className="sk-bar" style={{ display: "block", height: 72, borderRadius: 16 }} />
          </div>
          <SkeletonRows header count={3} dot={false} />
        </>
      )}
      {route === "settings" && (
        <>
          <SkeletonRows header count={3} dot={false} />
          <SkeletonRows header count={3} dot={false} />
        </>
      )}
      {route !== "home" && route !== "settings" && route !== "recurring" && route !== "budgets" && (
        <SkeletonRows
          header={route === "schedule"}
          count={5}
          dot={route !== "contacts" && route !== "money"}
        />
      )}
      {route === "schedule" && <SkeletonRows header count={2} dot />}
    </div>
  );
}

/* ── Dashboard skeleton ──
   Mirrors Home's real stack — attention rows, the money-pulse card with
   its hero figure over three stats, the six-month chart, and the taller
   figures — so the first paint already has the destination's shape and
   the crossfade has nothing to jump over. */
function SkeletonDashboard() {
  return (
    <>
      <div className="section">
        <div className="section-header">
          <span className="sk-bar sk-bar-md" style={{ width: 150 }} />
        </div>
        <div className="card">
          {[0, 1].map((i) => (
            <div className="row-item" key={i} style={{ cursor: "default", gap: 12 }}>
              <span className="sk-bar" style={{ width: 34, height: 34, borderRadius: 12 }} />
              <div
                className="row-content"
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                <span className="sk-bar sk-bar-md" style={{ width: `${62 - i * 8}%` }} />
                <span className="sk-bar sk-bar-xs" style={{ width: `${48 + i * 6}%` }} />
              </div>
              <span className="sk-bar sk-bar-md" style={{ width: 62 }} />
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="sk-bar sk-bar-md" style={{ width: 84 }} />
        </div>
        <div className="card" style={{ padding: 16 }}>
          <span className="sk-bar" style={{ display: "block", width: 168, height: 30 }} />
          <span className="sk-bar sk-bar-sm" style={{ display: "block", width: 128, marginTop: 10 }} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10,
              marginTop: 18
            }}
          >
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <span className="sk-bar sk-bar-xs" style={{ width: "70%" }} />
                <span className="sk-bar sk-bar-md" style={{ width: "88%" }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="sk-bar sk-bar-md" style={{ width: 110 }} />
        </div>
        <div className="card" style={{ padding: "14px 16px 12px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 104 }}>
            {[44, 68, 30, 86, 56, 100].map((h, i) => (
              <span
                key={i}
                className="sk-bar"
                style={{ flex: 1, height: `${h}%`, borderRadius: "4px 4px 0 0" }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span
                key={i}
                className="sk-bar sk-bar-xs"
                style={{ flex: 1, maxWidth: 12, margin: "0 auto" }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="sk-bar sk-bar-md" style={{ width: 92 }} />
        </div>
        <div className="card">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 12px" }}
              >
                <span className="sk-bar sk-bar-xs" style={{ width: "76%" }} />
                <span className="sk-bar sk-bar-lg" style={{ width: 30 }} />
              </div>
            ))}
          </div>
          <div className="row-item" style={{ cursor: "default" }}>
            <span className="sk-circle" style={{ width: 8, height: 8 }} />
            <div className="row-content" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="sk-bar sk-bar-md" style={{ width: "54%" }} />
              <span className="sk-bar sk-bar-xs" style={{ width: "38%" }} />
            </div>
          </div>
        </div>
      </div>
    </>
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
