import { describe, expect, it } from "vitest";
import type { Assignment, Course, Expense, ScheduleEvent } from "../../types";
import {
  assignmentProgress,
  courseCost,
  courseSessions,
  courseSpend,
  courseTareas,
  courseTimeline,
  coursesByStatus,
  dueAssignments,
  dueLabel,
  monthsSpanned,
  nextSession,
  sortAssignments,
  taskProgress
} from "../studies";

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
    // Charges follow the start-date anniversary like the tuition rule: 09-15, 10-15, 11-15 (12-15 > end).
    expect(courseCost(course({ startDate: "2026-09-15", endDate: "2026-12-01" }), []).total).toBe(9000);
    expect(courseCost(course({ paymentPlan: "per_session", cost: 250 }), [], [session("2026-09-01"), session("2026-09-08")])).toEqual({
      total: 500,
      paid: 0,
      remaining: 500
    });
    expect(courseCost(course({ paymentPlan: "free", cost: null }), paid).total).toBe(0);
  });

  it("ranks courses by what they cost in a period", () => {
    const list = [course({ id: "c1", name: "Maestría" }), course({ id: "c2", name: "Taller de grabado" })];
    const spent = [
      { ...expense(3000, "c1"), date: "2026-09-01" },
      { ...expense(3000, "c1"), id: "x2", date: "2026-10-01" },
      { ...expense(800, "c2"), date: "2026-09-10" },
      { ...expense(500, null), date: "2026-09-10" },
      { ...expense(999, "c1"), id: "x-out", date: "2026-08-30" }
    ];
    expect(courseSpend(list, spent, "2026-09-01", "2026-10-31")).toEqual([
      { id: "c1", label: "Maestría", amount: 6000, count: 2, share: 6000 / 6800 },
      { id: "c2", label: "Taller de grabado", amount: 800, count: 1, share: 800 / 6800 }
    ]);
    expect(courseSpend(list, [], "2026-09-01", "2026-09-30")).toEqual([]);
  });

  it("leaves the total unknown when it can't be derived, but still reports what was paid", () => {
    expect(courseCost(course({ paymentPlan: "monthly", endDate: null }), [expense(3000, "c1")])).toEqual({ total: null, paid: 3000, remaining: null });
  });
});

const tarea = (id: string, over: Partial<Assignment> = {}): Assignment => ({
  id, courseId: "c1", title: `Tarea ${id}`, description: "", dueDate: null, dueTime: null, status: "todo",
  completedAt: null, projectId: null, grade: "", feedback: "", createdAt: "2026-09-01", ...over
});

describe("tareas", () => {
  const list = [
    tarea("late", { dueDate: "2026-09-10" }),
    tarea("today", { dueDate: TODAY, dueTime: "18:00" }),
    tarea("today-early", { dueDate: TODAY, dueTime: "09:00" }),
    tarea("soon", { dueDate: "2026-09-20" }),
    tarea("later", { dueDate: "2026-10-30" }),
    tarea("undated"),
    tarea("done-old", { status: "done", completedAt: "2026-09-01", dueDate: "2026-09-02" }),
    tarea("done-new", { status: "done", completedAt: "2026-09-12" })
  ];

  it("sorts open ones by due date and time, undated last, delivered newest first", () => {
    expect(sortAssignments(list).map((a) => a.id)).toEqual([
      "late", "today-early", "today", "soon", "later", "undated", "done-new", "done-old"
    ]);
  });

  it("buckets open tareas by urgency and ignores delivered ones", () => {
    const b = dueAssignments(list, TODAY);
    expect(b.overdue.map((a) => a.id)).toEqual(["late"]);
    expect(b.today.map((a) => a.id)).toEqual(["today-early", "today"]);
    expect(b.soon.map((a) => a.id)).toEqual(["soon"]);
    expect(b.later.map((a) => a.id)).toEqual(["later"]);
    expect(b.undated.map((a) => a.id)).toEqual(["undated"]);
  });

  it("measures progress by delivered count and by task lines in markdown", () => {
    expect(assignmentProgress(list)).toEqual({ total: 8, done: 2, ratio: 0.25 });
    expect(assignmentProgress([])).toEqual({ total: 0, done: 0, ratio: 0 });
    expect(taskProgress("- [x] boceto\n- [ ] color\n* [X] marco\n1. [ ] entregar\nno es tarea")).toEqual({ total: 4, done: 2 });
  });

  it("phrases the due line and grades its urgency", () => {
    expect(dueLabel(tarea("a", { dueDate: "2026-09-13" }), TODAY)).toEqual({ text: "Venció hace 2 días", tone: "overdue" });
    expect(dueLabel(tarea("b", { dueDate: TODAY, dueTime: "18:00" }), TODAY)).toEqual({ text: "Vence hoy 18:00", tone: "today" });
    expect(dueLabel(tarea("c", { dueDate: "2026-09-16" }), TODAY)).toEqual({ text: "Vence mañana", tone: "quiet" });
    expect(dueLabel(tarea("d", { dueDate: "2026-09-20" }), TODAY)).toEqual({ text: "Vence en 5 días", tone: "quiet" });
    expect(dueLabel(tarea("e", { dueDate: "2026-10-30" }), TODAY)).toEqual({ text: "Vence vie 30 oct", tone: "quiet" });
    expect(dueLabel(tarea("f"), TODAY)).toEqual({ text: "Sin fecha", tone: "quiet" });
  });

  it("summarizes what a course still asks, with the overdue date first", () => {
    expect(courseTareas(list, TODAY)).toEqual({ pending: 6, overdue: 1, dueToday: 2, nextDue: "2026-09-10" });
    expect(courseTareas([tarea("a", { dueDate: "2026-09-20" }), tarea("b")], TODAY)).toEqual({ pending: 2, overdue: 0, dueToday: 0, nextDue: "2026-09-20" });
    expect(courseTareas([], TODAY).nextDue).toBeNull();
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
