import { describe, expect, it } from "vitest";
import type { EventSeries, ScheduleEvent } from "../../types";
import { describeSeries, missingOccurrences, pendingOccurrences, seriesDates, seriesFuture } from "../series";

function series(over: Partial<EventSeries> = {}): EventSeries {
  return {
    id: "ser1",
    title: "Óleo",
    kind: "class",
    cadence: "weekly",
    weekdays: [2, 4], // mar, jue
    startTime: "17:00",
    endTime: "19:00",
    location: "Taller",
    startDate: "2026-09-15", // a Tuesday
    endDate: null,
    projectId: null,
    contactId: null,
    groupId: null,
    notes: "",
    createdAt: "2026-09-15",
    ...over
  };
}
const occurrence = (date: string, over: Partial<ScheduleEvent> = {}): ScheduleEvent => ({
  id: `e-${date}`, title: "Óleo", kind: "class", date, startTime: "17:00", endTime: "19:00", location: "Taller",
  projectId: null, contactId: null, budget: null, seriesId: "ser1", cancelled: false, detached: false, notes: "", createdAt: date, ...over
});

describe("seriesDates", () => {
  it("expands a weekly multi-weekday series inside the window", () => {
    expect(seriesDates(series(), "2026-09-15", "2026-09-30")).toEqual([
      "2026-09-15", "2026-09-17", "2026-09-22", "2026-09-24", "2026-09-29"
    ]);
  });

  it("starts each weekday at its first slot on/after the start date", () => {
    // Start on a Wednesday; Tuesday train begins the following week.
    expect(seriesDates(series({ startDate: "2026-09-16" }), "2026-09-16", "2026-09-23")).toEqual([
      "2026-09-17", "2026-09-22"
    ]);
  });

  it("steps biweekly and respects the end date", () => {
    expect(seriesDates(series({ cadence: "biweekly", weekdays: [1], startDate: "2026-09-14", endDate: "2026-10-13" }), "2026-09-01", "2026-12-31")).toEqual([
      "2026-09-14", "2026-09-28", "2026-10-12"
    ]);
  });

  it("uses the start date's weekday when none is given, and clamps monthly", () => {
    expect(seriesDates(series({ weekdays: [] }), "2026-09-15", "2026-09-29")).toEqual(["2026-09-15", "2026-09-22", "2026-09-29"]);
    expect(seriesDates(series({ cadence: "monthly", startDate: "2026-08-31" }), "2026-08-01", "2026-11-30")).toEqual([
      "2026-08-31", "2026-09-30", "2026-10-31", "2026-11-30"
    ]);
  });
});

describe("missingOccurrences / pendingOccurrences", () => {
  it("only creates rows for dates that have none, cancelled ones included", () => {
    const have = [occurrence("2026-09-15"), occurrence("2026-09-17", { cancelled: true })];
    const missing = missingOccurrences(series(), have, "2026-09-15", "2026-09-24");
    expect(missing.map((m) => m.date)).toEqual(["2026-09-22", "2026-09-24"]);
    expect(missing[0]).toMatchObject({ title: "Óleo", kind: "class", startTime: "17:00", seriesId: "ser1", detached: false });
  });

  it("looks ahead from today to the horizon, never before a future start", () => {
    const future = series({ id: "ser2", startDate: "2026-10-01", weekdays: [4] }); // Oct 1 2026 is a Thursday
    const pending = pendingOccurrences([series(), future], [], "2026-09-15", 21);
    expect(pending.filter((p) => p.seriesId === "ser2").map((p) => p.date)).toEqual(["2026-10-01"]);
    expect(pending.filter((p) => p.seriesId === "ser1")).toHaveLength(7);
  });
});

describe("seriesFuture / describeSeries", () => {
  it("lists future non-detached occurrences", () => {
    const events = [occurrence("2026-09-15"), occurrence("2026-09-22", { detached: true }), occurrence("2026-09-24")];
    expect(seriesFuture(series(), events, "2026-09-20").map((e) => e.date)).toEqual(["2026-09-24"]);
  });

  it("describes the cadence in Spanish", () => {
    expect(describeSeries(series())).toBe("Cada mar y jue");
    expect(describeSeries(series({ weekdays: [1] }))).toBe("Cada lun");
    expect(describeSeries(series({ cadence: "biweekly", weekdays: [1, 3, 5] }))).toBe("Cada 2 semanas: lun, mié y vie");
    expect(describeSeries(series({ cadence: "monthly", startDate: "2026-09-15" }))).toBe("Cada mes el 15");
  });
});
