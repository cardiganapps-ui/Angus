import type { IconName } from "../components/Icon";
import type { Route } from "../hooks/useNavigation";

/* ── Destinations ──
   One catalog for every place the app can take her, read by the bottom
   pill, the drawer and the Ajustes editor. The pill shows
   `settings.tabs` in her order; the drawer shows everything else, so
   the two never disagree about where a module lives. Ajustes is the
   only route not offered for the bar — it is one tap from the drawer
   head and the avatar. */

export type TabRoute = Exclude<Route, "settings">;

export type NavGroupKey = "day" | "practice" | "money";

export interface NavItem {
  route: TabRoute;
  label: string;
  icon: IconName;
  group: NavGroupKey;
  /** Hidden from the drawer unless the practice includes one of these
      (or she already has rows); a route she pinned to the bar shows
      regardless — she chose it. */
  practice?: string[];
}

export const NAV_GROUP_TITLE: Record<NavGroupKey, string> = {
  day: "Tu día",
  practice: "Tu práctica",
  money: "Dinero"
};

export const NAV_ITEMS: readonly NavItem[] = [
  { route: "home", label: "Hoy", icon: "home", group: "day" },
  { route: "schedule", label: "Agenda", icon: "calendar", group: "day" },
  { route: "money", label: "Dinero", icon: "banknote", group: "day" },
  { route: "projects", label: "Obra", icon: "palette", group: "practice" },
  { route: "contacts", label: "Contactos", icon: "users", group: "practice" },
  { route: "classes", label: "Clases", icon: "graduation", group: "practice", practice: ["classes", "workshops"] },
  { route: "studies", label: "Estudios", icon: "book", group: "practice", practice: ["studies"] },
  { route: "notes", label: "Notas", icon: "edit", group: "practice" },
  { route: "expos", label: "Expos", icon: "map-pin", group: "practice", practice: ["expos"] },
  { route: "recurring", label: "Recurrentes", icon: "repeat", group: "money" },
  { route: "budgets", label: "Presupuestos", icon: "target", group: "money" },
  { route: "forecast", label: "Pronóstico", icon: "trending", group: "money" },
  { route: "reports", label: "Reportes", icon: "chart", group: "money" }
];

export const TAB_CHOICES: readonly TabRoute[] = NAV_ITEMS.map((item) => item.route);

/* Dinero · Hoy · Agenda — money and calendar on the thumbs, the day in
   the middle where a home tab sits. */
export const DEFAULT_TABS: readonly TabRoute[] = ["money", "home", "schedule"];

/* Two so the pill still reads as a choice; five so the Spanish labels
   ("Presupuestos", "Recurrentes") survive a 360px phone. */
export const MIN_TABS = 2;
export const MAX_TABS = 5;

export function navItem(route: Route): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.route === route);
}

/** A saved list, forgiving: unknown routes dropped, duplicates
    collapsed, capped at MAX_TABS; fewer than MIN_TABS valid entries
    means the blob is not a bar and the default is used instead. */
export function normalizeTabs(value: unknown): TabRoute[] {
  if (!Array.isArray(value)) return [...DEFAULT_TABS];
  const seen = new Set<TabRoute>();
  for (const v of value) {
    if (typeof v === "string" && (TAB_CHOICES as readonly string[]).includes(v)) seen.add(v as TabRoute);
  }
  const tabs = [...seen].slice(0, MAX_TABS);
  return tabs.length >= MIN_TABS ? tabs : [...DEFAULT_TABS];
}

export function isTabRoute(route: Route, tabs: readonly Route[]): boolean {
  return tabs.includes(route);
}

/* Where the topbar's back chevron goes from a route that is not in the
   bar. Finance sub-screens return to Dinero (a drawer route itself
   when she took it off the bar, which just means one more chevron);
   everything else lands on Hoy, or on the first tab when Hoy is not in
   the bar either. */
const PARENT: Partial<Record<Route, Route>> = {
  recurring: "money",
  budgets: "money",
  forecast: "money",
  reports: "money"
};

export function landingRoute(tabs: readonly Route[]): Route {
  return tabs.includes("home") ? "home" : (tabs[0] ?? "home");
}

export function parentRoute(route: Route, tabs: readonly Route[]): Route {
  const parent = PARENT[route];
  if (parent && parent !== route) return parent;
  const landing = landingRoute(tabs);
  return landing === route ? (tabs.find((t) => t !== route) ?? "home") : landing;
}
