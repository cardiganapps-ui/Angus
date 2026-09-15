import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  daysUntil,
  formatShort,
  formatWithWeekday,
  isPast,
  isToday,
  parseISODate,
  toISODate,
  todayISO
} from "../dates";

describe("dates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15, 10, 30)); // 15 Sep 2026, local time
  });
  afterEach(() => vi.useRealTimers());

  it("todayISO uses local date, not UTC", () => {
    expect(todayISO()).toBe("2026-09-15");
  });

  it("round-trips ISO ↔ Date without timezone drift", () => {
    expect(toISODate(parseISODate("2026-01-31"))).toBe("2026-01-31");
    expect(toISODate(parseISODate("2026-12-01"))).toBe("2026-12-01");
  });

  it("formats short Spanish dates", () => {
    expect(formatShort("2026-09-15")).toBe("15 sep");
    expect(formatShort("2026-01-03")).toBe("3 ene");
  });

  it("formats with Spanish weekday", () => {
    expect(formatWithWeekday("2026-09-15")).toBe("mar 15 sep");
    expect(formatWithWeekday("2026-09-20")).toBe("dom 20 sep");
  });

  it("isPast / isToday compare against local today", () => {
    expect(isPast("2026-09-14")).toBe(true);
    expect(isPast("2026-09-15")).toBe(false);
    expect(isToday("2026-09-15")).toBe(true);
    expect(isToday("2026-09-16")).toBe(false);
  });

  it("daysUntil is signed and DST-safe", () => {
    expect(daysUntil("2026-09-15")).toBe(0);
    expect(daysUntil("2026-09-18")).toBe(3);
    expect(daysUntil("2026-09-10")).toBe(-5);
    expect(daysUntil("2026-11-15")).toBe(61);
  });
});
