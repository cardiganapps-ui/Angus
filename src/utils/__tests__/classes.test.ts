import { describe, expect, it } from "vitest";
import type { Attendance, ClassEnrollment, ClassGroup, Payment, RecurringRule, Sale, ScheduleEvent } from "../../types";
import {
  activeEnrollments,
  attendanceRate,
  groupOccupancy,
  groupSessions,
  isPerSessionTuitionSale,
  perSessionTuitionSale,
  planTuitionForRollCall,
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

/* ── Cobro por sesión: a roll call that can be corrected ──
   A per-session group bills at roll call. Flipping a billed student to
   absent used to leave that confirmed sale standing forever, with the
   sheet telling her to go cancel it by hand in Dinero. It is cancelled
   now — never deleted, because a Payment may already exist against it
   and deleting the sale would cascade that record of real money away. */
const perSessionSale = (id: string, eventId: string, contactId: string, over: Partial<Sale> = {}): Sale => ({
  id,
  title: "Óleo martes · sesión",
  amount: 350,
  date: "2026-09-08",
  status: "confirmed",
  category: "class",
  paymentTerms: "single",
  projectId: null,
  contactId,
  eventId,
  recurringRuleId: null,
  periodKey: eventId,
  notes: "",
  createdAt: "2026-09-08",
  ...over
});

describe("identifying the sale a roll call created", () => {
  it("matches on the session's id as period key, with no rule behind it", () => {
    expect(isPerSessionTuitionSale(perSessionSale("x1", "s2", "c1"), "s2")).toBe(true);
    expect(isPerSessionTuitionSale(perSessionSale("x1", "s2", "c1"), "s1")).toBe(false);
  });

  it("never matches a manual sale or a monthly tuition sale", () => {
    // A sale she typed in herself carries no period key at all...
    const manual = perSessionSale("x1", "s2", "c1", { periodKey: null });
    expect(isPerSessionTuitionSale(manual, "s2")).toBe(false);
    // ...and a monthly colegiatura is keyed to the month, by a rule.
    const monthly = perSessionSale("x2", "s2", "c1", { recurringRuleId: "r-c1", periodKey: "2026-09" });
    expect(isPerSessionTuitionSale(monthly, "s2")).toBe(false);
    expect(perSessionTuitionSale([manual, monthly], "s2", "c1")).toBeNull();
  });

  it("refuses a sale a rule generated, whatever its period key says", () => {
    /* The two unique indexes on sales.period_key stay disjoint only
       because one requires recurring_rule_id to be null (migration 010).
       A roll call owns the null side; a colegiatura mensual is not its
       business even if the keys ever collided. */
    const ruled = perSessionSale("x1", "s2", "c1", { recurringRuleId: "r-c1" });
    expect(isPerSessionTuitionSale(ruled, "s2")).toBe(false);
    // Same for a sale of another kind that happens to carry the key.
    const piece = perSessionSale("x2", "s2", "c1", { category: "piece" });
    expect(isPerSessionTuitionSale(piece, "s2")).toBe(false);
    expect(planTuitionForRollCall("s2", [{ contactId: "c1", attending: false }], [ruled, piece], []).toCancel).toEqual([]);
  });

  it("keeps one student's sale apart from another's", () => {
    const sales = [perSessionSale("x1", "s2", "c1"), perSessionSale("x2", "s2", "c2")];
    expect(perSessionTuitionSale(sales, "s2", "c2")?.id).toBe("x2");
    expect(perSessionTuitionSale(sales, "s2", "c3")).toBeNull();
  });
});

describe("planTuitionForRollCall", () => {
  const roll = (present: string[], away: string[] = []) => [
    ...present.map((contactId) => ({ contactId, attending: true })),
    ...away.map((contactId) => ({ contactId, attending: false }))
  ];

  it("bills whoever attended and has no sale for this session yet", () => {
    const plan = planTuitionForRollCall("s2", roll(["c1", "c2"]), [], []);
    expect(plan.toBill).toEqual(["c1", "c2"]);
    expect(plan.toCancel).toEqual([]);
    expect(plan.toRestore).toEqual([]);
  });

  it("never bills the same student twice for one session", () => {
    const plan = planTuitionForRollCall("s2", roll(["c1"]), [perSessionSale("x1", "s2", "c1")], []);
    expect(plan.toBill).toEqual([]);
  });

  it("cancels the sale of a student flipped to absent — it does not delete it", () => {
    const existing = perSessionSale("x1", "s2", "c1");
    const plan = planTuitionForRollCall("s2", roll([], ["c1"]), [existing], []);
    expect(plan.toCancel.map((s) => s.id)).toEqual(["x1"]);
    expect(plan.toBill).toEqual([]);
  });

  it("treats a justified absence the same way: the session was not taken", () => {
    // "Avisó" is still an absence for a class billed per session.
    const existing = perSessionSale("x1", "s2", "c1");
    expect(planTuitionForRollCall("s2", roll([], ["c1"]), [existing], []).toCancel).toHaveLength(1);
  });

  it("reports cash already taken on a cancelled cobro as refundable", () => {
    const existing = perSessionSale("x1", "s2", "c1");
    const paid: Payment = { id: "p1", saleId: "x1", amount: 350, date: "2026-09-08", method: "cash", notes: "", createdAt: "2026-09-08" };
    const plan = planTuitionForRollCall("s2", roll([], ["c1"]), [existing], [paid]);
    // The money she took for a session that didn't happen is hers to
    // give back — "Por devolver" — not a line that quietly vanishes.
    expect(plan.refundable).toBe(350);
  });

  it("revives the cancelled sale instead of inserting a duplicate", () => {
    // (period_key, contact_id) is unique, so a second insert would be
    // rejected outright — and a rejected insert is not a bill.
    const cancelled = perSessionSale("x1", "s2", "c1", { status: "cancelled" });
    const plan = planTuitionForRollCall("s2", roll(["c1"]), [cancelled], []);
    expect(plan.toRestore.map((s) => s.id)).toEqual(["x1"]);
    expect(plan.toBill).toEqual([]);
  });

  it("leaves an already-cancelled sale alone when the student stays away", () => {
    const cancelled = perSessionSale("x1", "s2", "c1", { status: "cancelled" });
    const plan = planTuitionForRollCall("s2", roll([], ["c1"]), [cancelled], []);
    expect(plan.toCancel).toEqual([]);
    expect(plan.refundable).toBe(0);
  });

  it("never touches an unrelated manual sale to the same student", () => {
    const manual = perSessionSale("x9", "s2", "c1", { periodKey: null, category: "piece" });
    const plan = planTuitionForRollCall("s2", roll([], ["c1"]), [manual], []);
    expect(plan.toCancel).toEqual([]);
    // ...and she is still billed for the session, because that manual
    // sale was never this session's cobro.
    expect(planTuitionForRollCall("s2", roll(["c1"]), [manual], []).toBill).toEqual(["c1"]);
  });

  it("does the three things at once for one roll call", () => {
    const sales = [
      perSessionSale("x1", "s2", "c1"), // was present, now away  → cancel
      perSessionSale("x2", "s2", "c2", { status: "cancelled" }), // back → restore
      perSessionSale("x3", "s9", "c3") // another session entirely
    ];
    const plan = planTuitionForRollCall("s2", roll(["c2", "c3"], ["c1"]), sales, []);
    expect(plan.toCancel.map((s) => s.id)).toEqual(["x1"]);
    expect(plan.toRestore.map((s) => s.id)).toEqual(["x2"]);
    expect(plan.toBill).toEqual(["c3"]);
  });
});
