import { useCallback, useEffect, useRef, type TouchEvent as ReactTouchEvent } from "react";
import { Icon } from "./Icon";
import { useEscape } from "../hooks/useEscape";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useSheetExit } from "../hooks/useSheetExit";
import { useApp } from "../context/AppContext";
import { useSession } from "../context/SessionContext";
import type { Route } from "../hooks/useNavigation";
import { NAV_GROUP_TITLE, NAV_ITEMS, type NavGroupKey, type NavItem } from "../data/nav";
import { firstName } from "../utils/settings";
import { haptic } from "../lib/haptics";

/* ── Drawer ──
   The side menu: every destination that is NOT in her bottom bar
   (data/nav.ts is the one catalog both read from), so a module she
   pins to the pill leaves the menu and one she removes shows up here.
   Which practice items appear depends on the workspace's practice (a
   studio that doesn't teach has no Clases entry) — see `visible`. */

const GROUP_ORDER: NavGroupKey[] = ["day", "practice", "money"];

const SWIPE_CLOSE_PX = 56;

export function Drawer({
  route,
  navigate,
  onClose,
  rail = false
}: {
  route: Route;
  navigate: (r: Route) => void;
  /** null in rail mode — nothing to close. */
  onClose: (() => void) | null;
  rail?: boolean;
}) {
  const { settings, workspace, projects, contacts, rules, events, groups, courses } = useApp();
  const session = useSession();
  const { exiting, animatedClose } = useSheetExit(true, onClose);
  useEscape(rail ? null : animatedClose);
  const panelRef = useFocusTrap(!rail);
  const swipe = useRef<{ x: number; y: number; dx: number; active: boolean } | null>(null);

  const counts: Partial<Record<Route, number>> = {
    projects: projects.length,
    contacts: contacts.length,
    recurring: rules.filter((r) => r.active).length,
    expos: events.filter((e) => e.kind === "expo" && !e.cancelled).length,
    classes: groups.filter((g) => g.active).length,
    studies: courses.filter((c) => c.status === "active" || c.status === "upcoming").length
  };

  const go = useCallback(
    (next: Route) => {
      haptic.tap();
      navigate(next);
      if (!rail) animatedClose();
    },
    [navigate, rail, animatedClose]
  );

  // A route change from anywhere else (tab pill, OS back) closes it too.
  const mountedRoute = useRef(route);
  useEffect(() => {
    if (rail || route === mountedRoute.current) return;
    animatedClose();
  }, [route, rail, animatedClose]);

  const onTouchStart = (e: ReactTouchEvent) => {
    if (rail) return;
    const t = e.touches[0];
    swipe.current = { x: t.clientX, y: t.clientY, dx: 0, active: false };
  };
  const onTouchMove = (e: ReactTouchEvent) => {
    const s = swipe.current;
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (!s.active) {
      if (Math.abs(dx) < 8 || Math.abs(dy) > Math.abs(dx)) return;
      s.active = true;
    }
    s.dx = Math.min(0, dx);
    const el = panelRef.current;
    if (el) {
      el.style.transition = "none";
      el.style.transform = `translateX(${s.dx}px)`;
    }
  };
  const onTouchEnd = () => {
    const s = swipe.current;
    swipe.current = null;
    const el = panelRef.current;
    if (!s || !s.active || !el) return;
    if (s.dx < -SWIPE_CLOSE_PX) {
      el.style.transition = "transform var(--dur-base) var(--ease-in)";
      el.style.transform = "translateX(-104%)";
      animatedClose();
    } else {
      el.style.transition = "transform var(--dur-slow) var(--ease-spring)";
      el.style.transform = "";
    }
  };

  const practice = settings.practice;
  const inBar = new Set<Route>(settings.tabs);
  const visible = (item: NavItem) =>
    !inBar.has(item.route) &&
    (!item.practice ||
      practice.length === 0 ||
      (counts[item.route] ?? 0) > 0 ||
      item.practice.some((p) => practice.includes(p as never)));
  const menuGroups = GROUP_ORDER.map((key) => ({
    title: NAV_GROUP_TITLE[key],
    items: NAV_ITEMS.filter((item) => item.group === key && visible(item))
  }));

  const name = firstName(settings.artistName) || session.email;
  const initial = (settings.artistName || session.email || "?").slice(0, 1).toUpperCase();

  const panel = (
    <nav
      className={`drawer ${rail ? "drawer--rail" : ""} ${exiting ? "drawer--exit" : ""}`}
      aria-label="Menú"
      ref={panelRef as React.RefObject<HTMLElement>}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <button type="button" className="drawer-head" onClick={() => go("settings")}>
        <span className="drawer-avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="drawer-head-text">
          <span className="drawer-name">{name}</span>
          <span className="drawer-studio">{workspace.name}</span>
        </span>
        <span className="row-chevron" aria-hidden="true">
          <Icon name="chevron-right" size={16} />
        </span>
      </button>

      <div className="drawer-nav scroll-bounce">
        {menuGroups.map((group) => {
          if (group.items.length === 0) return null;
          return (
            <div className="drawer-group" key={group.title}>
              <div className="drawer-group-title">{group.title}</div>
              {group.items.map((item) => {
                const active = route === item.route;
                const count = counts[item.route];
                return (
                  <button
                    key={item.route}
                    type="button"
                    className={`drawer-item ${active ? "drawer-item--active" : ""}`}
                    aria-current={active ? "page" : undefined}
                    onClick={() => go(item.route)}
                  >
                    <span className="drawer-item-icon">
                      <Icon name={item.icon} size={20} />
                    </span>
                    <span className="drawer-item-label">{item.label}</span>
                    {count !== undefined && count > 0 && (
                      <span className="drawer-item-count">{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}

        <div className="drawer-group">
          <div className="drawer-group-title">Angus</div>
          <button
            type="button"
            className={`drawer-item ${route === "settings" ? "drawer-item--active" : ""}`}
            aria-current={route === "settings" ? "page" : undefined}
            onClick={() => go("settings")}
          >
            <span className="drawer-item-icon">
              <Icon name="settings" size={20} />
            </span>
            <span className="drawer-item-label">Ajustes</span>
          </button>
          <button
            type="button"
            className="drawer-item"
            onClick={() => {
              haptic.tap();
              session.openAccount();
              if (!rail) animatedClose();
            }}
          >
            <span className="drawer-item-icon">
              <Icon name="user" size={20} />
            </span>
            <span className="drawer-item-label">Tu cuenta</span>
          </button>
          <button
            type="button"
            className="drawer-item"
            onClick={() => {
              haptic.tap();
              session.openFeedback();
              if (!rail) animatedClose();
            }}
          >
            <span className="drawer-item-icon">
              <Icon name="message" size={20} />
            </span>
            <span className="drawer-item-label">Cuéntale a Diego</span>
          </button>
        </div>
      </div>

      <div className="drawer-foot">
        {session.workspaces.length > 1 && (
          <button
            type="button"
            className="drawer-item"
            onClick={() => {
              haptic.tap();
              session.openAccount();
              if (!rail) animatedClose();
            }}
          >
            <span className="drawer-item-icon">
              <Icon name="repeat" size={18} />
            </span>
            <span className="drawer-item-label">Cambiar de espacio</span>
          </button>
        )}
        <div className="drawer-version">Angus {__APP_VERSION__}</div>
      </div>
    </nav>
  );

  if (rail) return panel;

  return (
    <>
      <div
        className={`drawer-overlay ${exiting ? "drawer-overlay--exit" : ""}`}
        onClick={animatedClose}
        aria-hidden="true"
      />
      {panel}
    </>
  );
}
