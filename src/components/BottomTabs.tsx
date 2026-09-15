import type { CSSProperties } from "react";
import { Icon, type IconName } from "./Icon";
import type { Route } from "../hooks/useNavigation";
import { haptic } from "../lib/haptics";

/* Three tabs: the day, the calendar, the money. Everything else — Obra,
   Contactos, Clases, Expos, the finance sub-screens, Ajustes — lives in
   the side drawer so the pill stays roomy on a phone. */
const TABS: { key: Route; label: string; icon: IconName }[] = [
  { key: "home", label: "Hoy", icon: "home" },
  { key: "schedule", label: "Agenda", icon: "calendar" },
  { key: "money", label: "Dinero", icon: "banknote" }
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
        style={{ "--active-i": Math.max(activeIndex, 0), "--tab-count": TABS.length } as CSSProperties}
      >
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
              }}
            >
              <span className="bottom-tab-icon" aria-hidden="true">
                <Icon name={tab.icon} size={22} />
              </span>
              <span className="bottom-tab-label">{tab.label}</span>
            </button>
          );
        })}
      </nav>
      {/* CSS no-op now that the pill floats detached from the bottom edge. */}
      <div className="bottom-tabs-safezone" aria-hidden="true" />
    </>
  );
}
