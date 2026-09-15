import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  addMonths,
  daysUntil,
  formatDateLong,
  formatMonthLong,
  greetingFor,
  monthInitial,
  monthName,
  monthRange,
  formatShort,
  formatWithWeekday,
  isPast,
  isToday,
  relativeDayLabel,
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

  it("monthRange spans the whole calendar month, inclusive", () => {
    expect(monthRange("2026-09-15")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(monthRange("2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2024-02-10")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(monthRange("2026-12-31")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("formatMonthLong capitalizes the Spanish month, from a date or a month key", () => {
    expect(formatMonthLong("2026-09-15")).toBe("Septiembre 2026");
    expect(formatMonthLong("2026-01")).toBe("Enero 2026");
  });

  it("addDays crosses month and year boundaries", () => {
    expect(addDays("2026-09-25", 15)).toBe("2026-10-10");
    expect(addDays("2026-12-28", 5)).toBe("2027-01-02");
    expect(addDays("2026-09-15", 0)).toBe("2026-09-15");
  });

  it("addMonths keeps the day of month, clamped to shorter months", () => {
    expect(addMonths("2026-10-05", 2)).toBe("2026-12-05");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
  });

  it("formatDateLong reads like a headline date", () => {
    expect(formatDateLong("2026-09-15")).toBe("Martes 15 de septiembre");
    expect(formatDateLong("2026-01-01")).toBe("Jueves 1 de enero");
    expect(formatDateLong("2026-12-30")).toBe("Miércoles 30 de diciembre");
  });

  it("monthName and monthInitial name the month alone", () => {
    expect(monthName("2026-08-31")).toBe("agosto");
    expect(monthName("2026-03")).toBe("marzo");
    expect(monthInitial("2026-09")).toBe("S");
    expect(monthInitial("2026-05-04")).toBe("M");
  });

  it("greetingFor follows the wall clock", () => {
    expect(greetingFor(new Date(2026, 8, 15, 0, 5))).toBe("Buenos días");
    expect(greetingFor(new Date(2026, 8, 15, 11, 59))).toBe("Buenos días");
    expect(greetingFor(new Date(2026, 8, 15, 12, 0))).toBe("Buenas tardes");
    expect(greetingFor(new Date(2026, 8, 15, 19, 59))).toBe("Buenas tardes");
    expect(greetingFor(new Date(2026, 8, 15, 20, 0))).toBe("Buenas noches");
    expect(greetingFor(new Date(2026, 8, 15, 23, 30))).toBe("Buenas noches");
  });

  it("relativeDayLabel names the near days and counts the rest", () => {
    expect(relativeDayLabel(0)).toBe("Hoy");
    expect(relativeDayLabel(1)).toBe("Mañana");
    expect(relativeDayLabel(-1)).toBe("Ayer");
    expect(relativeDayLabel(3)).toBe("En 3 días");
    expect(relativeDayLabel(-14)).toBe("Hace 14 días");
    // Composed mid-sentence by the dashboard: "Vencida hace 14 días".
    expect(`Vencida ${relativeDayLabel(-14).toLowerCase()}`).toBe("Vencida hace 14 días");
  });
});
