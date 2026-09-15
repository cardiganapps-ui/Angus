import { describe, expect, it } from "vitest";
import type { Expense, RecurringRule, Sale } from "../../types";
import { pendingMaterializations } from "../materialize";

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
    active: true,
    notes: "",
    createdAt: "2026-07-01",
    ...over
  };
}

function expenseRow(ruleId: string, periodKey: string): Expense {
  return {
    id: `e-${periodKey}`,
    title: "Renta",
    amount: 6500,
    date: periodKey,
    category: "rent",
    method: null,
    projectId: null,
    eventId: null,
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
    expect(pending.expenses.map((e) => e.periodKey)).toEqual(["2026-08-01", "2026-09-01"]);
    expect(pending.expenses[0]).toMatchObject({
      title: "Renta",
      amount: 6500,
      category: "rent",
      recurringRuleId: "r1",
      date: "2026-08-01"
    });
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
      periodKey: "2026-09-25",
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
      periodKey: "2026-09-01",
      notes: "",
      createdAt: "2026-09-01"
    };
    expect(pendingMaterializations([tuition], [existing], [], TODAY).sales).toEqual([]);
  });
});
