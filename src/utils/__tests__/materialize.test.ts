import { describe, expect, it } from "vitest";
import type { Expense, RecurringRule, Sale } from "../../types";
import { INCOME_LOOKAHEAD_DAYS, pendingMaterializations } from "../materialize";

const TODAY = "2026-09-15";

function rule(over: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r1",
    kind: "expense",
    title: "Renta",
    amount: 6500,
    category: "rent",
    cadence: "monthly",
    interval: 1,
    startDate: "2026-07-01",
    endDate: null,
    contactId: null,
    projectId: null,
    groupId: null,
    courseId: null,
    active: true,
    notes: "",
    createdAt: "2026-07-01",
    ...over
  };
}

function expenseRow(ruleId: string, date: string): Expense {
  const periodKey = date.slice(0, 7);
  return {
    id: `e-${periodKey}`,
    title: "Renta",
    amount: 6500,
    date,
    category: "rent",
    method: null,
    projectId: null,
    eventId: null,
    courseId: null,
    recurringRuleId: ruleId,
    periodKey,
    notes: "",
    createdAt: periodKey
  };
}

describe("pendingMaterializations", () => {
  it("creates every due period that has no row yet, and nothing twice", () => {
    const pending = pendingMaterializations([rule()], [], [expenseRow("r1", "2026-07-01")], TODAY);
    expect(pending.sales).toEqual([]);
    expect(pending.expenses.map((e) => e.periodKey)).toEqual(["2026-08", "2026-09"]);
    expect(pending.expenses[0]).toMatchObject({
      title: "Renta",
      amount: 6500,
      category: "rent",
      recurringRuleId: "r1",
      date: "2026-08-01"
    });
  });

  it("does not duplicate a period when the rule's day of the month changes", () => {
    const have = [expenseRow("r1", "2026-07-01"), expenseRow("r1", "2026-08-01"), expenseRow("r1", "2026-09-01")];
    const moved = rule({ startDate: "2026-07-05" });
    expect(pendingMaterializations([moved], [], have, TODAY).expenses).toEqual([]);
  });

  it("skips paused rules and never reaches past today for expenses", () => {
    expect(pendingMaterializations([rule({ active: false })], [], [], TODAY).expenses).toEqual([]);
    const soon = pendingMaterializations([rule({ startDate: "2026-09-16" })], [], [], TODAY);
    expect(soon.expenses).toEqual([]);
  });

  it("materializes income as confirmed single-payment sales with a look-ahead", () => {
    const tuition = rule({
      id: "r2",
      kind: "income",
      title: "Colegiatura Sofía",
      amount: 1800,
      category: "class",
      startDate: "2026-09-25",
      contactId: "c1"
    });
    const pending = pendingMaterializations([tuition], [], [], TODAY);
    expect(pending.sales).toHaveLength(1);
    expect(pending.sales[0]).toMatchObject({
      title: "Colegiatura Sofía",
      amount: 1800,
      status: "confirmed",
      category: "class",
      paymentTerms: "single",
      contactId: "c1",
      recurringRuleId: "r2",
      periodKey: "2026-09",
      date: "2026-09-25"
    });
    // Beyond the look-ahead: not yet.
    expect(pendingMaterializations([tuition], [], [], TODAY, 5).sales).toEqual([]);
  });

  it("recognizes an existing materialized sale by rule + period", () => {
    const tuition = rule({ id: "r2", kind: "income", category: "class", startDate: "2026-09-01" });
    const existing: Sale = {
      id: "s1",
      title: "x",
      amount: 1800,
      date: "2026-09-01",
      status: "confirmed",
      category: "class",
      paymentTerms: "single",
      projectId: null,
      contactId: null,
      eventId: null,
      recurringRuleId: "r2",
      periodKey: "2026-09",
      notes: "",
      createdAt: "2026-09-01"
    };
    expect(pendingMaterializations([tuition], [existing], [], TODAY).sales).toEqual([]);
  });
});

describe("backfill cap", () => {
  const oldRule: RecurringRule = {
    id: "r-old",
    kind: "expense",
    title: "Renta",
    amount: 5000,
    category: "rent",
    cadence: "monthly",
    interval: 1,
    startDate: "2015-01-01",
    endDate: null,
    active: true,
    contactId: null,
    projectId: null,
    groupId: null,
    courseId: null,
    notes: "",
    createdAt: "2015-01-01"
  };

  /* A monthly rule dated 2015 used to insert ~130 expenses the moment
     the app loaded, rewriting a decade of months she never entered. */
  it("never inserts more than the cap for one rule", () => {
    const pending = pendingMaterializations([oldRule], [], [], "2026-09-16");
    expect(pending.expenses.length).toBeLessThanOrEqual(24);
    expect(pending.expenses).toHaveLength(24);
  });

  it("keeps the most recent periods, not the rule's first year", () => {
    const pending = pendingMaterializations([oldRule], [], [], "2026-09-16");
    const dates = pending.expenses.map((e) => e.date).sort();
    expect(dates[dates.length - 1]).toBe("2026-09-01");
    expect(dates[0]).toBe("2024-10-01");
  });

  it("reports what it held back, so the UI can offer it instead of hiding it", () => {
    const pending = pendingMaterializations([oldRule], [], [], "2026-09-16");
    expect(pending.deferred).toHaveLength(1);
    expect(pending.deferred[0]).toMatchObject({ ruleId: "r-old", oldest: "2015-01-01" });
    expect(pending.deferred[0].skipped).toBeGreaterThan(100);
  });

  it("defers nothing for a rule that started inside the window", () => {
    const recent = { ...oldRule, id: "r-new", startDate: "2026-07-01" };
    const pending = pendingMaterializations([recent], [], [], "2026-09-16");
    expect(pending.deferred).toEqual([]);
    expect(pending.expenses).toHaveLength(3);
  });

  it("honours a caller-supplied cap", () => {
    const pending = pendingMaterializations([oldRule], [], [], "2026-09-16", INCOME_LOOKAHEAD_DAYS, 3);
    expect(pending.expenses).toHaveLength(3);
    expect(pending.expenses.map((e) => e.date).sort()).toEqual(["2026-07-01", "2026-08-01", "2026-09-01"]);
  });
});
