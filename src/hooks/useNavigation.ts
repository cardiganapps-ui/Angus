import { useCallback, useEffect, useState } from "react";
import { recordVisit } from "../lib/usage";

/* ── Routes ──
   Three of these live in the bottom tab pill (see TAB_ROUTES); every
   other one is reached from the side drawer and shows a back chevron in
   the topbar. Hash-based so a reload and the OS back gesture both work
   without a router. */
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

export const TAB_ROUTES: readonly Route[] = ["home", "schedule", "money"];

/* Where the topbar's back chevron goes from a drawer route. Finance
   sub-screens return to Dinero; everything else to Hoy. */
const PARENT: Partial<Record<Route, Route>> = {
  recurring: "money",
  budgets: "money",
  forecast: "money",
  reports: "money"
};

export function isTabRoute(route: Route): boolean {
  return TAB_ROUTES.includes(route);
}

export function parentRoute(route: Route): Route {
  return PARENT[route] ?? "home";
}

function readRoute(): Route {
  const hash = window.location.hash.replace("#", "");
  return (ROUTES as readonly string[]).includes(hash) ? (hash as Route) : "home";
}

export const ALL_ROUTES = ROUTES;

export function useNavigation() {
  const [route, setRoute] = useState<Route>(readRoute);

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
  }, [route]);

  const navigate = useCallback((next: Route) => {
    window.location.hash = next;
    setRoute(next);
  }, []);

  const back = useCallback(() => {
    navigate(parentRoute(readRoute()));
  }, [navigate]);

  return { route, navigate, back };
}
