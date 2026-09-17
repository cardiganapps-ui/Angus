import { useCallback, useEffect, useRef, useState } from "react";
import { recordVisit } from "../lib/usage";
import { recordBreadcrumb } from "../lib/breadcrumbs";
import { isTabRoute, landingRoute, parentRoute } from "../data/nav";

/* ── Routes ──
   The ones in `settings.tabs` live in the bottom pill; every other one
   is reached from the side drawer and shows a back chevron in the
   topbar (data/nav.ts is the catalog). Hash-based so a reload and the
   OS back gesture both work without a router. */
export type Route =
  | "home"
  | "schedule"
  | "money"
  | "projects"
  | "contacts"
  | "classes"
  | "studies"
  | "notes"
  | "expos"
  | "recurring"
  | "budgets"
  | "forecast"
  | "reports"
  | "settings";

const ROUTES: readonly Route[] = [
  "home",
  "schedule",
  "money",
  "projects",
  "contacts",
  "classes",
  "studies",
  "notes",
  "expos",
  "recurring",
  "budgets",
  "forecast",
  "reports",
  "settings"
];

function readRoute(): Route {
  const hash = window.location.hash.replace("#", "");
  return (ROUTES as readonly string[]).includes(hash) ? (hash as Route) : "home";
}

export const ALL_ROUTES = ROUTES;

/* `tabs` is the bar as she configured it. It arrives with the
   workspace, after the first render, so it is read through a ref: the
   callbacks stay stable and still see the latest bar. */
export function useNavigation(tabs: readonly Route[]) {
  const [route, setRoute] = useState<Route>(readRoute);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  /* Which screens she actually opens — the only instrumentation point
     needed, since every navigation lands here, including a hash change
     and the OS back gesture. Local counts, never transmitted; see
     lib/usage.ts. */
  useEffect(() => {
    recordVisit(route);
    recordBreadcrumb("route", route);
  }, [route]);

  /* Where she came from, so the chevron takes her BACK rather than to a
     fixed parent: Obra → Contactos → chevron used to land on Hoy. Only
     tab routes are remembered — from a drawer route the parent is the
     right answer (Obra → Recurrentes → back is Dinero, not Obra) — and
     the OS back gesture is untouched; it walks the hash history. */
  const cameFrom = useRef<Route | null>(null);

  const navigate = useCallback((next: Route) => {
    const current = readRoute();
    if (current !== next) cameFrom.current = isTabRoute(current, tabsRef.current) ? current : null;
    window.location.hash = next;
    setRoute(next);
  }, []);

  const back = useCallback(() => {
    const current = readRoute();
    const from = cameFrom.current;
    navigate(from && from !== current ? from : parentRoute(current, tabsRef.current));
  }, [navigate]);

  /* A fresh open (no hash yet) lands on Hoy, or on her first tab when
     she took Hoy off the bar — the bar is the app as she set it up.
     Only ever runs before the first navigation: after that the hash is
     set and a settings change never yanks her off a screen. */
  useEffect(() => {
    if (window.location.hash) return;
    const landing = landingRoute(tabs);
    if (landing !== "home") navigate(landing);
  }, [tabs, navigate]);

  return { route, navigate, back };
}
