import { afterEach, describe, expect, it } from "vitest";
import { readBreadcrumbs, recordBreadcrumb, resetBreadcrumbsForTests } from "../../lib/breadcrumbs";

afterEach(() => resetBreadcrumbsForTests());

describe("breadcrumbs", () => {
  it("records in order with a timestamp", () => {
    recordBreadcrumb("route", "home", "2026-09-17T10:00:00.000Z");
    recordBreadcrumb("route", "money", "2026-09-17T10:00:05.000Z");
    expect(readBreadcrumbs()).toEqual([
      { at: "2026-09-17T10:00:00.000Z", kind: "route", text: "home" },
      { at: "2026-09-17T10:00:05.000Z", kind: "route", text: "money" }
    ]);
  });

  it("collapses an immediate repeat instead of flooding the trail", () => {
    recordBreadcrumb("console", "boom");
    recordBreadcrumb("console", "boom");
    recordBreadcrumb("console", "boom");
    expect(readBreadcrumbs()).toHaveLength(1);
    // …but the same text after something else is a new step.
    recordBreadcrumb("route", "notes");
    recordBreadcrumb("console", "boom");
    expect(readBreadcrumbs()).toHaveLength(3);
  });

  it("keeps only the last 40", () => {
    for (let i = 0; i < 60; i++) recordBreadcrumb("route", `r${i}`);
    const trail = readBreadcrumbs();
    expect(trail).toHaveLength(40);
    expect(trail[0].text).toBe("r20");
    expect(trail[39].text).toBe("r59");
  });

  it("clips long messages and squashes whitespace", () => {
    recordBreadcrumb("error", `  x  \n  ${"y".repeat(400)}`);
    const [only] = readBreadcrumbs();
    expect(only.text.startsWith("x y")).toBe(true);
    expect(only.text.length).toBeLessThanOrEqual(301);
    expect(only.text.endsWith("…")).toBe(true);
  });
});
