import { describe, expect, it } from "vitest";
import type { Attendance, ClassEnrollment, Expense, NoteTag, Sale, ScheduleEvent } from "../../types";
import {
  sameAttendance,
  sameEnrollment,
  sameExpense,
  sameNoteTag,
  sameOccurrence,
  sameSale,
  sameSkip
} from "../../data/rows";

/* Each natural key mirrors a partial unique index in supabase/migrations.
   These pin the SHAPE of that mirror — which fields, and which nulls
   never match — so a 23505 is read as convergence exactly where Postgres
   would have raised it, and nowhere else. */

const sale = (over: Partial<Sale>): Sale => ({
  id: "s",
  title: "",
  amount: 1,
  date: "2026-09-01",
  status: "confirmed",
  category: "class",
  paymentTerms: "single",
  projectId: null,
  contactId: null,
  eventId: null,
  recurringRuleId: null,
  periodKey: null,
  notes: "",
  createdAt: "2026-09-01",
  ...over
});

describe("sameSale", () => {
  it("matches a rule-generated period whatever the id", () => {
    expect(sameSale(sale({ id: "a", recurringRuleId: "r", periodKey: "2026-09" }), sale({ id: "b", recurringRuleId: "r", periodKey: "2026-09" }))).toBe(true);
  });
  it("different rule or period is a different sale", () => {
    expect(sameSale(sale({ recurringRuleId: "r", periodKey: "2026-09" }), sale({ recurringRuleId: "r", periodKey: "2026-10" }))).toBe(false);
    expect(sameSale(sale({ recurringRuleId: "r", periodKey: "2026-09" }), sale({ recurringRuleId: "q", periodKey: "2026-09" }))).toBe(false);
  });
  it("per-session tuition: same session + same student, no rule", () => {
    expect(sameSale(sale({ periodKey: "evt-1", contactId: "c1" }), sale({ periodKey: "evt-1", contactId: "c1" }))).toBe(true);
    expect(sameSale(sale({ periodKey: "evt-1", contactId: "c1" }), sale({ periodKey: "evt-1", contactId: "c2" }))).toBe(false);
  });
  it("a rule-generated row and a session row never collide, even on the same key", () => {
    expect(sameSale(sale({ recurringRuleId: "r", periodKey: "k", contactId: "c1" }), sale({ periodKey: "k", contactId: "c1" }))).toBe(false);
  });
  it("plain sales (no period) never match each other", () => {
    expect(sameSale(sale({ id: "a", contactId: "c1" }), sale({ id: "b", contactId: "c1" }))).toBe(false);
  });
});

describe("sameExpense / sameSkip", () => {
  const expense = (over: Partial<Expense>): Expense => ({
    id: "e",
    title: "",
    amount: 1,
    date: "2026-09-01",
    category: "rent",
    method: null,
    projectId: null,
    eventId: null,
    courseId: null,
    recurringRuleId: null,
    periodKey: null,
    notes: "",
    createdAt: "2026-09-01",
    ...over
  });
  it("expense: rule + period, never two hand-made rows", () => {
    expect(sameExpense(expense({ recurringRuleId: "r", periodKey: "2026-09" }), expense({ recurringRuleId: "r", periodKey: "2026-09" }))).toBe(true);
    expect(sameExpense(expense({}), expense({}))).toBe(false);
  });
  it("skip: rule + period", () => {
    const a = { id: "1", createdAt: "", recurringRuleId: "r", periodKey: "2026-09" };
    expect(sameSkip(a, { ...a, id: "2" })).toBe(true);
    expect(sameSkip(a, { ...a, id: "2", periodKey: "2026-10" })).toBe(false);
  });
});

describe("sameOccurrence / sameEnrollment / sameAttendance / sameNoteTag", () => {
  const event = (over: Partial<ScheduleEvent>): ScheduleEvent => ({
    id: "e",
    title: "",
    kind: "class",
    date: "2026-09-01",
    startTime: null,
    endTime: null,
    location: "",
    projectId: null,
    contactId: null,
    budget: null,
    courseId: null,
    missed: false,
    seriesId: null,
    cancelled: false,
    detached: false,
    notes: "",
    createdAt: "2026-09-01",
    ...over
  });
  it("occurrence: series + date; two one-off events on a day are distinct", () => {
    expect(sameOccurrence(event({ seriesId: "s" }), event({ id: "x", seriesId: "s" }))).toBe(true);
    expect(sameOccurrence(event({}), event({ id: "x" }))).toBe(false);
  });
  it("enrollment: group + contact", () => {
    const e: ClassEnrollment = { id: "1", groupId: "g", contactId: "c", startedOn: "", endedOn: null, recurringRuleId: null, notes: "", createdAt: "" };
    expect(sameEnrollment(e, { ...e, id: "2" })).toBe(true);
    expect(sameEnrollment(e, { ...e, id: "2", contactId: "d" })).toBe(false);
  });
  it("attendance: session + contact", () => {
    const a: Attendance = { id: "1", eventId: "e", contactId: "c", status: "present", createdAt: "" };
    expect(sameAttendance(a, { ...a, id: "2", status: "absent" })).toBe(true);
    expect(sameAttendance(a, { ...a, id: "2", eventId: "f" })).toBe(false);
  });
  it("note tag: label, case- and space-insensitive like lower(label)", () => {
    const t: NoteTag = { id: "1", label: "Ideas", color: "accent", createdAt: "" };
    expect(sameNoteTag(t, { ...t, id: "2", label: " ideas " })).toBe(true);
    expect(sameNoteTag(t, { ...t, id: "2", label: "idea" })).toBe(false);
  });
});
