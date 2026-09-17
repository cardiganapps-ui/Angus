import { describe, expect, it } from "vitest";
import {
  DEFAULT_TABS,
  MAX_TABS,
  MIN_TABS,
  NAV_ITEMS,
  TAB_CHOICES,
  isTabRoute,
  landingRoute,
  normalizeTabs,
  parentRoute
} from "../../data/nav";

describe("normalizeTabs", () => {
  it("defaults to Dinero · Hoy · Agenda", () => {
    expect(DEFAULT_TABS).toEqual(["money", "home", "schedule"]);
    expect(normalizeTabs(undefined)).toEqual(DEFAULT_TABS);
    expect(normalizeTabs("home")).toEqual(DEFAULT_TABS);
    expect(normalizeTabs([])).toEqual(DEFAULT_TABS);
  });

  it("keeps her order and drops what is not a destination", () => {
    expect(normalizeTabs(["projects", "home", "settings", "nope", 3, "notes"])).toEqual(["projects", "home", "notes"]);
  });

  it("collapses duplicates keeping the first position", () => {
    expect(normalizeTabs(["home", "money", "home", "schedule"])).toEqual(["home", "money", "schedule"]);
  });

  it(`caps at ${MAX_TABS} and needs at least ${MIN_TABS}`, () => {
    expect(normalizeTabs([...TAB_CHOICES])).toHaveLength(MAX_TABS);
    expect(normalizeTabs([...TAB_CHOICES])).toEqual(TAB_CHOICES.slice(0, MAX_TABS));
    expect(normalizeTabs(["home"])).toEqual(DEFAULT_TABS);
    expect(normalizeTabs(["home", "zzz"])).toEqual(DEFAULT_TABS);
  });

  it("offers every catalog route and never Ajustes", () => {
    expect(TAB_CHOICES).toEqual(NAV_ITEMS.map((i) => i.route));
    expect(TAB_CHOICES).not.toContain("settings");
    for (const route of TAB_CHOICES) {
      expect(normalizeTabs([route, "home"])).toContain(route);
    }
  });
});

describe("isTabRoute", () => {
  it("is whatever the bar says, not a fixed trio", () => {
    expect(isTabRoute("home", DEFAULT_TABS)).toBe(true);
    expect(isTabRoute("projects", DEFAULT_TABS)).toBe(false);
    expect(isTabRoute("projects", ["projects", "notes"])).toBe(true);
    expect(isTabRoute("home", ["projects", "notes"])).toBe(false);
  });
});

describe("landingRoute", () => {
  it("is Hoy while Hoy is in the bar, else her first tab", () => {
    expect(landingRoute(DEFAULT_TABS)).toBe("home");
    expect(landingRoute(["projects", "home"])).toBe("home");
    expect(landingRoute(["projects", "notes"])).toBe("projects");
    expect(landingRoute([])).toBe("home");
  });
});

describe("parentRoute", () => {
  it("returns finance sub-screens to Dinero", () => {
    for (const r of ["recurring", "budgets", "forecast", "reports"] as const) {
      expect(parentRoute(r, DEFAULT_TABS)).toBe("money");
      // …even when Dinero left the bar: one more chevron, never a dead end.
      expect(parentRoute(r, ["home", "notes"])).toBe("money");
    }
  });

  it("returns everything else to the landing tab", () => {
    expect(parentRoute("projects", DEFAULT_TABS)).toBe("home");
    expect(parentRoute("settings", DEFAULT_TABS)).toBe("home");
    expect(parentRoute("projects", ["notes", "money"])).toBe("notes");
  });

  it("never points a screen at itself", () => {
    expect(parentRoute("home", ["projects", "notes"])).toBe("projects");
    expect(parentRoute("money", ["projects", "notes"])).toBe("projects");
    expect(parentRoute("notes", ["notes", "money"])).toBe("money");
  });
});
