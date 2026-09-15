import { describe, expect, it } from "vitest";
import type { Attendance, ClassEnrollment, ClassGroup, Payment, RecurringRule, Sale, ScheduleEvent } from "../../types";
import {
  activeEnrollments,
  attendanceRate,
  groupOccupancy,
  groupSessions,
  sessionsWithoutAttendance,
  summarizeTuition,
  tuitionStatus
} from "../classes";

const TODAY = "2026-09-15";
const group: ClassGroup = {
  id: "g1", name: "Óleo martes", seriesId: "ser1", tuitionAmount: 1800, tuitionCadence: "monthly",
  capacity: 3, location: "Taller", active: true, notes: "", createdAt: "2026-08-01"
};
const enroll = (id: string, contactId: string, over: Partial<ClassEnrollment> = {}): ClassEnrollment => ({
  id, groupId: "g1", contactId, startedOn: "2026-08-01", endedOn: null, recurringRuleId: `r-${contactId}`, notes: "", createdAt: "2026-08-01", ...over
});
const session = (id: string, date: string): ScheduleEvent => ({
  id, title: "Óleo", kind: "class", date, startTime: "17:00", endTime: "19:00", location: "", projectId: null, contactId: null,
  budget: null, courseId: null, missed: false, seriesId: "ser1", cancelled: false, detached: false, notes: "", createdAt: date
});
const att = (eventId: string, contactId: string, status: Attendance["status"]): Attendance => ({
  id: `${eventId}-${contactId}`, eventId, contactId, status, createdAt: "2026-09-01"
});
const rule = (contactId: string): RecurringRule => ({
  id: `r-${contactId}`, kind: "income", title: `Colegiatura ${contactId}`, amount: 1800, category: "class", cadence: "monthly",
  interval: 1, startDate: "2026-08-05", endDate: null, contactId, projectId: null, groupId: "g1", courseId: null, active: true, notes: "", createdAt: "2026-08-01"
});
const sale = (id: string, ruleId: string, date: string, contactId: string): Sale => ({
  id, title: "Colegiatura", amount: 1800, date, status: "confirmed", category: "class", paymentTerms: "single", projectId: null,
  contactId, eventId: null, recurringRuleId: ruleId, periodKey: date, notes: "", createdAt: date
});
const payment = (saleId: string, amount: number): Payment => ({
  id: `p-${saleId}`, saleId, amount, date: "2026-09-06", method: "cash", notes: "", createdAt: "2026-09-06"
});

describe("enrollment + occupancy", () => {
  it("counts only enrollments active today and reports fullness", () => {
    const enrollments = [
      enroll("e1", "c1"),
      enroll("e2", "c2", { endedOn: "2026-08-31" }),
      enroll("e3", "c3", { startedOn: "2026-10-01" }),
      enroll("e4", "c4")
    ];
    expect(activeEnrollments(enrollments, "g1", TODAY).map((e) => e.contactId)).toEqual(["c1", "c4"]);
    expect(groupOccupancy(group, enrollments, TODAY)).toEqual({ enrolled: 2, capacity: 3, ratio: 2 / 3, full: false });
    expect(groupOccupancy({ ...group, capacity: null }, enrollments, TODAY).ratio).toBeNull();
  });
});

describe("sessions + attendance", () => {
  const sessions = [session("s1", "2026-09-01"), session("s2", "2026-09-08"), session("s3", "2026-09-22")];
  const attendance = [att("s1", "c1", "present"), att("s2", "c1", "absent"), att("s1", "c2", "excused")];

  it("lists a group's sessions newest first and the past ones not yet taken", () => {
    expect(groupSessions(group, sessions).map((s) => s.id)).toEqual(["s3", "s2", "s1"]);
    expect(sessionsWithoutAttendance(sessions, attendance, TODAY)).toEqual([]);
    expect(sessionsWithoutAttendance(sessions, [att("s1", "c1", "present")], TODAY).map((s) => s.id)).toEqual(["s2"]);
  });

  it("computes a student's rate ignoring excused sessions", () => {
    expect(attendanceRate("c1", sessions, attendance)).toEqual({ sessions: 2, present: 1, absent: 1, excused: 0, rate: 50 });
    expect(attendanceRate("c2", sessions, attendance)).toEqual({ sessions: 1, present: 0, absent: 0, excused: 1, rate: null });
  });
});

describe("tuitionStatus", () => {
  it("flags each student's tuition for the month as paid, pending, overdue or none", () => {
    const enrollments = [enroll("e1", "c1"), enroll("e2", "c2"), enroll("e3", "c3", { recurringRuleId: null }), enroll("e4", "c4")];
    const rules = [rule("c1"), rule("c2"), rule("c4")];
    const sales = [
      sale("s1", "r-c1", "2026-09-05", "c1"), // paid
      sale("s2", "r-c2", "2026-09-05", "c2"), // overdue (past, unpaid)
      sale("s4", "r-c4", "2026-09-25", "c4") // pending (future)
    ];
    const rows = tuitionStatus(group, enrollments, rules, sales, [payment("s1", 1800)], TODAY, TODAY);
    expect(rows.map((r) => [r.contactId, r.state, r.owed])).toEqual([
      ["c1", "paid", 0],
      ["c2", "overdue", 1800],
      ["c3", "none", 0],
      ["c4", "pending", 1800]
    ]);
    expect(summarizeTuition(rows)).toEqual({ paid: 1, pending: 1, overdue: 1, none: 1, owed: 3600 });
  });
});
