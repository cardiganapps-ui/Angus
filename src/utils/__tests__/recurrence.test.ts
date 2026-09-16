import { describe, expect, it } from "vitest";
import type { RecurringRule } from "../../types";
import { describeCadence, monthlyEquivalent, nextOccurrence, nthOccurrence, occurrencesBetween, periodKeyFamily, periodKeyFor } from "../recurrence";

function rule(over: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r1",
    kind: "expense",
    title: "Renta",
    amount: 6500,
    category: "rent",
    cadence: "monthly",
    interval: 1,
    startDate: "2026-01-31",
    endDate: null,
    contactId: null,
    projectId: null,
    groupId: null,
    courseId: null,
    active: true,
    notes: "",
    createdAt: "2026-01-01",
    ...over
  };
}

describe("nthOccurrence", () => {
  it("clamps month-end and recovers on longer months", () => {
    const r = rule({ startDate: "2026-01-31" });
    expect(nthOccurrence(r, 0)).toBe("2026-01-31");
    expect(nthOccurrence(r, 1)).toBe("2026-02-28");
    expect(nthOccurrence(r, 2)).toBe("2026-03-31");
    expect(nthOccurrence(r, 3)).toBe("2026-04-30");
  });

  it("steps weekly and biweekly across a year boundary", () => {
    expect(nthOccurrence(rule({ cadence: "weekly", startDate: "2026-12-24" }), 2)).toBe("2027-01-07");
    expect(nthOccurrence(rule({ cadence: "biweekly", startDate: "2026-12-24" }), 1)).toBe("2027-01-07");
  });

  it("honours the interval", () => {
    expect(nthOccurrence(rule({ cadence: "monthly", interval: 3, startDate: "2026-01-15" }), 2)).toBe(
      "2026-07-15"
    );
    expect(nthOccurrence(rule({ cadence: "quarterly", startDate: "2026-01-15" }), 1)).toBe("2026-04-15");
    expect(nthOccurrence(rule({ cadence: "yearly", startDate: "2024-02-29" }), 1)).toBe("2025-02-28");
  });
});

describe("occurrencesBetween", () => {
  it("lists occurrences inside the window, inclusive, with their keys", () => {
    const r = rule({ startDate: "2026-01-15" });
    expect(occurrencesBetween(r, "2026-03-15", "2026-05-15")).toEqual([
      { date: "2026-03-15", periodKey: "2026-03" },
      { date: "2026-04-15", periodKey: "2026-04" },
      { date: "2026-05-15", periodKey: "2026-05" }
    ]);
  });

  it("keys weekly rules by the week, so moving the weekday re-keys nothing", () => {
    const tue = rule({ cadence: "weekly", startDate: "2026-09-15" });
    const thu = rule({ cadence: "weekly", startDate: "2026-09-17" });
    expect(occurrencesBetween(tue, "2026-09-14", "2026-09-27").map((o) => o.periodKey)).toEqual([
      "2026-09-14",
      "2026-09-21"
    ]);
    expect(occurrencesBetween(thu, "2026-09-14", "2026-09-27").map((o) => o.periodKey)).toEqual([
      "2026-09-14",
      "2026-09-21"
    ]);
  });

  it("stops at the rule's end date", () => {
    const r = rule({ startDate: "2026-01-15", endDate: "2026-03-01" });
    expect(occurrencesBetween(r, "2026-01-01", "2026-12-31").map((o) => o.date)).toEqual([
      "2026-01-15",
      "2026-02-15"
    ]);
  });

  it("is empty before the start date or for an inverted window", () => {
    const r = rule({ startDate: "2026-06-01" });
    expect(occurrencesBetween(r, "2026-01-01", "2026-05-31")).toEqual([]);
    expect(occurrencesBetween(r, "2026-09-01", "2026-08-01")).toEqual([]);
  });
});

describe("nextOccurrence", () => {
  it("returns the first date after the anchor", () => {
    const r = rule({ startDate: "2026-01-15" });
    expect(nextOccurrence(r, "2026-09-15")).toBe("2026-10-15");
    expect(nextOccurrence(r, "2026-09-14")).toBe("2026-09-15");
  });

  it("is null when paused or ended", () => {
    expect(nextOccurrence(rule({ active: false }), "2026-09-15")).toBeNull();
    expect(nextOccurrence(rule({ startDate: "2026-01-15", endDate: "2026-06-30" }), "2026-09-15")).toBeNull();
  });

  it("returns the start date itself for a rule that hasn't begun", () => {
    expect(nextOccurrence(rule({ startDate: "2027-01-01" }), "2026-09-15")).toBe("2027-01-01");
  });
});

describe("monthlyEquivalent", () => {
  it("normalizes every cadence to a month", () => {
    expect(monthlyEquivalent(rule({ amount: 1200, cadence: "monthly", interval: 1 }))).toBe(1200);
    expect(monthlyEquivalent(rule({ amount: 1200, cadence: "yearly", interval: 1 }))).toBe(100);
    expect(monthlyEquivalent(rule({ amount: 300, cadence: "weekly", interval: 1 }))).toBe(1300);
    expect(monthlyEquivalent(rule({ amount: 900, cadence: "quarterly", interval: 1 }))).toBe(300);
    expect(monthlyEquivalent(rule({ amount: 1000, cadence: "monthly", interval: 2 }))).toBe(500);
  });
});

describe("describeCadence", () => {
  it("reads naturally in Spanish", () => {
    expect(describeCadence({ cadence: "monthly", interval: 1 })).toBe("Cada mes");
    expect(describeCadence({ cadence: "weekly", interval: 2 })).toBe("Cada 2 semanas");
    expect(describeCadence({ cadence: "yearly", interval: 1 })).toBe("Cada año");
  });
});

describe("periodKeyFamily", () => {
  it("groups the cadences that key periods the same way", () => {
    expect(periodKeyFamily("weekly")).toBe("week");
    expect(periodKeyFamily("biweekly")).toBe("week");
    expect(periodKeyFamily("monthly")).toBe("month");
    expect(periodKeyFamily("quarterly")).toBe("month");
    expect(periodKeyFamily("yearly")).toBe("month");
  });

  /* The money-duplication bug this exists to prevent: the same September,
     keyed two different ways, cannot collide on the unique index. */
  it("shows why a cross-family switch duplicates a period", () => {
    const sameDay = "2026-09-14";
    expect(periodKeyFor("monthly", sameDay)).toBe("2026-09");
    expect(periodKeyFor("weekly", sameDay)).toBe("2026-09-14");
    expect(periodKeyFor("monthly", sameDay)).not.toBe(periodKeyFor("weekly", sameDay));
  });

  it("re-keys nothing within a family", () => {
    expect(periodKeyFor("monthly", "2026-09-30")).toBe(periodKeyFor("yearly", "2026-09-01"));
    expect(periodKeyFor("weekly", "2026-09-14")).toBe(periodKeyFor("biweekly", "2026-09-16"));
  });
});
