import { describe, expect, it } from "vitest";
import type { Expense, Installment, Payment, RecurringRule, Sale } from "../../types";
import { forecast, forecastNet } from "../forecast";

const TODAY = "2026-09-15";

function sale(id: string, amount: number, over: Partial<Sale> = {}): Sale {
  return {
    id,
    title: `Venta ${id}`,
    amount,
    date: "2026-09-10",
    status: "confirmed",
    category: "piece",
    paymentTerms: "single",
    projectId: null,
    contactId: "c1",
    eventId: null,
    recurringRuleId: null,
    periodKey: null,
    notes: "",
    createdAt: "2026-09-10",
    ...over
  };
}
const payment = (id: string, saleId: string, amount: number, date: string): Payment => ({
  id, saleId, amount, date, method: "transfer", notes: "", createdAt: date
});
const installment = (id: string, saleId: string, amount: number, dueDate: string): Installment => ({
  id, saleId, amount, dueDate, notes: "", createdAt: "2026-09-01"
});
const expense = (id: string, amount: number, date: string, ruleId: string | null = null): Expense => ({
  id, title: `Gasto ${id}`, amount, date, category: "materials", method: null,
  projectId: null, eventId: null, courseId: null, recurringRuleId: ruleId, periodKey: ruleId ? date : null, notes: "", createdAt: date
});
function rule(id: string, kind: RecurringRule["kind"], amount: number, startDate: string): RecurringRule {
  return {
    id, kind, title: id, amount, category: kind === "income" ? "class" : "rent", cadence: "monthly",
    interval: 1, startDate, endDate: null, contactId: null, projectId: null, groupId: null, courseId: null, active: true, notes: "", createdAt: startDate
  };
}

describe("forecast", () => {
  it("places unpaid cuotas by due date and overdue ones in the current month", () => {
    const s = sale("s1", 9000, { paymentTerms: "installments" });
    const plan = [
      installment("i1", "s1", 3000, "2026-08-15"), // overdue → Sept
      installment("i2", "s1", 3000, "2026-10-15"),
      installment("i3", "s1", 3000, "2027-06-15") // beyond horizon
    ];
    const f = forecast({ sales: [s], payments: [], installments: plan, expenses: [], rules: [], today: TODAY, months: 3 });
    expect(f.months.map((m) => [m.month, m.committedIn])).toEqual([
      ["2026-09", 3000],
      ["2026-10", 3000],
      ["2026-11", 0]
    ]);
    expect(f.runway).toBeNull();
  });

  it("counts the remainder of a confirmed sale without a plan, not what was paid", () => {
    const s = sale("s1", 5000);
    const f = forecast({
      sales: [s],
      payments: [payment("p1", "s1", 2000, "2026-09-12")],
      installments: [],
      expenses: [],
      rules: [],
      today: TODAY,
      months: 2
    });
    expect(f.months[0].actualIn).toBe(2000);
    expect(f.months[0].committedIn).toBe(3000);
    expect(f.months[0].projectedIn).toBe(5000);
  });

  it("projects recurring rules only for periods not already materialized", () => {
    const rent = rule("r1", "expense", 6500, "2026-08-01");
    const already = expense("e1", 6500, "2026-09-01", "r1");
    const f = forecast({ sales: [], payments: [], installments: [], expenses: [already], rules: [rent], today: TODAY, months: 3 });
    expect(f.months.map((m) => [m.actualOut, m.recurringOut])).toEqual([
      [6500, 0],
      [0, 6500],
      [0, 6500]
    ]);
    expect(f.months[2].cumulative).toBe(-19500);
    expect(f.runway).toBe("2026-09");
  });

  it("estimates variable spend and new sales from the trailing months, scaled for the month in progress", () => {
    const history = [
      expense("e1", 900, "2026-06-10"),
      expense("e2", 600, "2026-07-10"),
      expense("e3", 300, "2026-08-10")
    ];
    const paid = sale("s0", 3000, { date: "2026-07-01" });
    const f = forecast({
      sales: [paid],
      payments: [payment("p0", "s0", 3000, "2026-07-05")],
      installments: [],
      expenses: history,
      rules: [],
      today: TODAY,
      months: 2
    });
    expect(f.averages).toEqual({ variableOut: 600, newSalesIn: 1000, monthsSampled: 3 });
    // 15 of 30 days left in September → half the monthly estimate.
    expect(f.months[0].estimatedOut).toBe(300);
    expect(f.months[0].estimatedIn).toBe(500);
    expect(f.months[1].estimatedOut).toBe(600);
    expect(f.months[1].estimatedIn).toBe(1000);
    expect(f.assumptions.some((a) => a.includes("últimos 3 meses"))).toBe(true);
  });

  it("separates committed net from projected net", () => {
    const tuition = rule("r2", "income", 1800, "2026-10-05");
    const f = forecast({
      sales: [],
      payments: [],
      installments: [],
      expenses: [expense("e1", 300, "2026-08-10")],
      rules: [tuition],
      today: TODAY,
      months: 2
    });
    const oct = f.months[1];
    expect(oct.recurringIn).toBe(1800);
    expect(oct.estimatedOut).toBe(100);
    expect(oct.committedNet).toBe(1800);
    expect(oct.projectedNet).toBe(1700);
    const net = forecastNet(f.months);
    expect(net.committed).toBe(1800);
    expect(net.projected).toBe(1800 - 50 - 100);
  });

  it("says so when there is no history", () => {
    const f = forecast({ sales: [], payments: [], installments: [], expenses: [], rules: [], today: TODAY });
    expect(f.months).toHaveLength(6);
    expect(f.assumptions[0]).toMatch(/Sin historial/);
  });
});
