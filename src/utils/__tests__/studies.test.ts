import { describe, expect, it } from "vitest";
import type { Course, Expense, ScheduleEvent } from "../../types";
import { courseCost, courseSessions, courseTimeline, coursesByStatus, monthsSpanned, nextSession } from "../studies";

const TODAY = "2026-09-15";

function course(over: Partial<Course> = {}): Course {
  return {
    id: "c1",
    name: "Maestría en Artes",
    kind: "master",
    status: "active",
    institution: "UNAM",
    teacherContactId: null,
    modality: "in_person",
    location: "",
    url: "",
    startDate: "2026-09-01",
    endDate: "2026-12-15",
    seriesId: "ser1",
    cost: 3000,
    paymentPlan: "monthly",
    recurringRuleId: null,
    notes: "",
    createdAt: "2026-08-20",
    ...over
  };
}
const session = (date: string, over: Partial<ScheduleEvent> = {}): ScheduleEvent => ({
  id: `e-${date}`, title: "Maestría", kind: "class", date, startTime: "17:00", endTime: "19:00", location: "",
  projectId: null, contactId: null, budget: null, courseId: null, missed: false, seriesId: "ser1", cancelled: false,
  detached: false, notes: "", createdAt: date, ...over
});
const expense = (amount: number, courseId: string | null): Expense => ({
  id: `x-${amount}-${courseId}`, title: "Colegiatura", amount, date: TODAY, category: "courses", method: null,
  projectId: null, eventId: null, courseId, recurringRuleId: null, periodKey: null, notes: "", createdAt: TODAY
});

describe("courseSessions / nextSession / courseTimeline", () => {
  it("merges the series' occurrences with one-offs linked to the course, skipping cancelled", () => {
    const events = [
      session("2026-09-10"),
      session("2026-09-17", { cancelled: true }),
      session("2026-09-20", { seriesId: null, courseId: "c1" }),
      session("2026-09-22", { seriesId: "other" })
    ];
    expect(courseSessions(course(), events).map((e) => e.date)).toEqual(["2026-09-10", "2026-09-20"]);
    expect(nextSession(courseSessions(course(), events), TODAY)?.date).toBe("2026-09-20");
  });

  it("counts past, missed and upcoming sessions", () => {
    const s = [session("2026-09-01", { missed: true }), session("2026-09-08"), session("2026-09-22")];
    expect(courseTimeline(s, TODAY)).toEqual({ total: 3, done: 2, missed: 1, upcoming: 1 });
  });
});

describe("courseCost", () => {
  it("knows the total for single, monthly with dates, per-session with sessions, and free", () => {
    const paid = [expense(3000, "c1"), expense(500, "c1"), expense(900, "other")];
    expect(courseCost(course({ paymentPlan: "single", cost: 12000 }), paid)).toEqual({ total: 12000, paid: 3500, remaining: 8500 });
    expect(monthsSpanned("2026-09-01", "2026-12-15")).toBe(4);
    expect(courseCost(course(), paid)).toEqual({ total: 12000, paid: 3500, remaining: 8500 });
    expect(courseCost(course({ paymentPlan: "per_session", cost: 250 }), [], [session("2026-09-01"), session("2026-09-08")])).toEqual({
      total: 500,
      paid: 0,
      remaining: 500
    });
    expect(courseCost(course({ paymentPlan: "free", cost: null }), paid).total).toBe(0);
  });

  it("leaves the total unknown when it can't be derived, but still reports what was paid", () => {
    expect(courseCost(course({ paymentPlan: "monthly", endDate: null }), [expense(3000, "c1")])).toEqual({ total: null, paid: 3000, remaining: null });
  });
});

describe("coursesByStatus", () => {
  it("buckets by status, promoting future start dates to upcoming", () => {
    const list = [
      course({ id: "a", name: "B" }),
      course({ id: "b", name: "A", startDate: "2026-10-01" }),
      course({ id: "c", name: "C", status: "completed", endDate: "2026-06-01" }),
      course({ id: "d", name: "D", status: "upcoming", startDate: null })
    ];
    const b = coursesByStatus(list, TODAY);
    expect(b.active.map((c) => c.id)).toEqual(["a"]);
    expect(b.upcoming.map((c) => c.id)).toEqual(["b", "d"]);
    expect(b.past.map((c) => c.id)).toEqual(["c"]);
  });
});
