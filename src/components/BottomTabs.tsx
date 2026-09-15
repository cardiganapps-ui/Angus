import type { CSSProperties } from "react";
import { Icon, type IconName } from "./Icon";
import type { Route } from "../hooks/useNavigation";
import { haptic } from "../lib/haptics";

/* ── Mobile bottom tab bar ──
   Port of Cardigan's BottomTabs: a floating Liquid Glass pill with a
   single sliding "active" capsule (.bottom-tab-indicator) that
   translates between tab slots via the --active-i CSS variable, so the
   slide runs on the compositor and survives re-renders that don't
   change the active tab. The native iOS 26 SwiftUI bar hand-off and
   i18n layer were Cardigan-specific and are not ported. */

const TABS: { key: Route; label: string; icon: IconName }[] = [
  { key: "home",     label: "Hoy",       icon: "home" },
  { key: "projects", label: "Proyectos", icon: "palette" },
  { key: "contacts", label: "Contactos", icon: "users" },
  { key: "schedule", label: "Agenda",    icon: "calendar" },
  { key: "money",    label: "Dinero",    icon: "banknote" },
];

/* Tab order, exported so App.tsx derives the screen slide direction
   from the same source the pill draws from. */
export const TAB_ORDER: Route[] = TABS.map((t) => t.key);

export function BottomTabs({ route, navigate }: { route: Route; navigate: (r: Route) => void }) {
  const activeIndex = TABS.findIndex((tab) => tab.key === route);
  const showIndicator = activeIndex >= 0;

  return (
    <>
      <nav
        className="bottom-tabs"
        aria-label="Navegación"
        style={{ "--active-i": activeIndex, "--tab-count": TABS.length } as CSSProperties}>
        {showIndicator && <span className="bottom-tab-indicator" aria-hidden="true" />}
        {TABS.map((tab, i) => {
          const active = route === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              aria-current={active ? "page" : undefined}
              className={`bottom-tab ${active ? "bottom-tab--active" : ""}`}
              data-tab-i={i}
              onClick={() => {
                if (!active) haptic.tap();
                navigate(tab.key);
              }}>
              <span className="bottom-tab-icon" aria-hidden="true"><Icon name={tab.icon} size={22} /></span>
              <span className="bottom-tab-label">{tab.label}</span>
            </button>
          );
        })}
      </nav>
      {/* Kept for parity with Cardigan's markup — a CSS no-op now that
          the pill floats detached from the bottom edge. */}
      <div className="bottom-tabs-safezone" aria-hidden="true" />
    </>
  );
}
