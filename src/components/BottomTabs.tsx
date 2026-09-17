import type { CSSProperties } from "react";
import { Icon } from "./Icon";
import type { Route } from "../hooks/useNavigation";
import { navItem } from "../data/nav";
import { haptic } from "../lib/haptics";

/* The pill shows `settings.tabs` in her order — Dinero · Hoy · Agenda
   by default, two to five of anything from data/nav.ts. Everything she
   leaves out lives in the side drawer so the pill stays roomy on a
   phone. */
export function BottomTabs({ tabs, route, navigate }: { tabs: readonly Route[]; route: Route; navigate: (r: Route) => void }) {
  const items = tabs.flatMap((key) => {
    const item = navItem(key);
    return item ? [item] : [];
  });
  const activeIndex = items.findIndex((tab) => tab.route === route);
  const showIndicator = activeIndex >= 0;

  return (
    <>
      <nav
        className="bottom-tabs"
        aria-label="Navegación"
        style={{ "--active-i": Math.max(activeIndex, 0), "--tab-count": items.length } as CSSProperties}
      >
        {showIndicator && <span className="bottom-tab-indicator" aria-hidden="true" />}
        {items.map((tab, i) => {
          const active = route === tab.route;
          return (
            <button
              key={tab.route}
              type="button"
              aria-current={active ? "page" : undefined}
              className={`bottom-tab ${active ? "bottom-tab--active" : ""}`}
              data-tab-i={i}
              onClick={() => {
                if (!active) haptic.tap();
                navigate(tab.route);
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
