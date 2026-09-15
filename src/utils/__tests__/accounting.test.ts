import { describe, expect, it } from "vitest";
import type { Expense, Installment, Payment, Sale, SaleStatus } from "../../types";
import { sumMoney } from "../money";
import {
  contactOwed,
  expenseBreakdown,
  expensesByCategory,
  generateInstallmentSchedule,
  clientBalances,
  expoEconomics,
  expoMargins,
  projectMargins,
  installmentPlan,
  overdueInstallments,
  projectEconomics,
  paidForSale,
  profitLoss,
  saleBalance,
  saleCountsTowardRevenue,
  totals
} from "../accounting";

const TODAY = "2026-09-15";

function sale(id: string, amount: number, status: SaleStatus, contactId = "c1"): Sale {
  return {
    id,
    title: `Venta ${id}`,
    amount,
    date: "2026-09-01",
    status,
    projectId: null,
    contactId,
    eventId: null,
    notes: "",
    createdAt: "2026-09-01"
  };
}

function payment(id: string, saleId: string, amount: number, date = "2026-09-05"): Payment {
  return { id, saleId, amount, date, method: "transfer", notes: "", createdAt: date };
}

function installment(id: string, saleId: string, amount: number, dueDate: string): Installment {
  return { id, saleId, amount, dueDate, notes: "", createdAt: "2026-09-01" };
}

function expense(id: string, amount: number, category: Expense["category"], date: string): Expense {
  return {
    id,
    title: `Gasto ${id}`,
    amount,
    date,
    category,
    projectId: null,
    eventId: null,
    notes: "",
    createdAt: date
  };
}

describe("which sales count", () => {
  it("counts confirmed and delivered only", () => {
    expect(saleCountsTowardRevenue(sale("s", 100, "confirmed"))).toBe(true);
    expect(saleCountsTowardRevenue(sale("s", 100, "delivered"))).toBe(true);
    expect(saleCountsTowardRevenue(sale("s", 100, "quoted"))).toBe(false);
    expect(saleCountsTowardRevenue(sale("s", 100, "cancelled"))).toBe(false);
  });
});

describe("saleBalance", () => {
  it("splits paid / owed on a partially paid sale", () => {
    const s = sale("s1", 8500, "confirmed");
    const b = saleBalance(s, [payment("p1", "s1", 3000), payment("p2", "s1", 500.5)]);
    expect(b.paid).toBe(3500.5);
    expect(b.owed).toBe(4999.5);
    expect(b.credit).toBe(0);
    expect(b.settled).toBe(false);
  });

  it("marks a fully paid sale settled with no owed", () => {
    const b = saleBalance(sale("s1", 1000, "delivered"), [payment("p1", "s1", 1000)]);
    expect(b.owed).toBe(0);
    expect(b.settled).toBe(true);
  });

  it("reports an overpayment as credit, never negative owed", () => {
    const b = saleBalance(sale("s1", 1000, "confirmed"), [payment("p1", "s1", 1200)]);
    expect(b.owed).toBe(0);
    expect(b.credit).toBe(200);
  });

  it("a quoted sale owes nothing yet", () => {
    const b = saleBalance(sale("s1", 5000, "quoted"), []);
    expect(b.owed).toBe(0);
  });

  it("a cancelled sale owes nothing even with payments recorded", () => {
    const b = saleBalance(sale("s1", 5000, "cancelled"), [payment("p1", "s1", 1000)]);
    expect(b.owed).toBe(0);
    expect(b.credit).toBe(0);
  });

  it("ignores payments belonging to other sales", () => {
    expect(paidForSale([payment("p1", "s2", 900)], "s1")).toBe(0);
  });
});

describe("totals", () => {
  it("excludes quoted and cancelled from every figure", () => {
    const sales = [
      sale("s1", 1000, "confirmed"),
      sale("s2", 2000, "delivered"),
      sale("s3", 9000, "quoted"),
      sale("s4", 7000, "cancelled")
    ];
    const payments = [payment("p1", "s1", 400), payment("p2", "s2", 2000), payment("p3", "s4", 7000)];
    expect(totals(sales, payments)).toEqual({
      committed: 3000,
      paid: 2400,
      owed: 600,
      credit: 0
    });
  });

  it("one client's credit never cancels another client's debt", () => {
    const sales = [sale("s1", 1000, "confirmed", "c1"), sale("s2", 1000, "confirmed", "c2")];
    const payments = [payment("p1", "s2", 1500)];
    const t = totals(sales, payments);
    expect(t.owed).toBe(1000);
    expect(t.credit).toBe(500);
    expect(contactOwed("c1", sales, payments)).toBe(1000);
    expect(contactOwed("c2", sales, payments)).toBe(0);
  });

  it("is empty-safe", () => {
    expect(totals([], [])).toEqual({ committed: 0, paid: 0, owed: 0, credit: 0 });
  });
});

describe("installment plans", () => {
  const plan = [
    installment("i1", "s1", 3000, "2026-08-01"),
    installment("i2", "s1", 3000, "2026-09-01"),
    installment("i3", "s1", 2500, "2026-10-01")
  ];

  it("allocates payments to the oldest installments first", () => {
    const states = installmentPlan("s1", plan, [payment("p1", "s1", 4000)], TODAY);
    expect(states.map((s) => s.state)).toEqual(["paid", "overdue", "pending"]);
    expect(states[1].covered).toBe(1000);
    expect(states[1].remaining).toBe(2000);
  });

  it("marks a future, partly covered installment partial — not overdue", () => {
    const states = installmentPlan("s1", plan, [payment("p1", "s1", 7000)], TODAY);
    expect(states.map((s) => s.state)).toEqual(["paid", "paid", "partial"]);
    expect(states[2].remaining).toBe(1500);
  });

  it("covers the whole plan when fully paid", () => {
    const states = installmentPlan("s1", plan, [payment("p1", "s1", 8500)], TODAY);
    expect(states.every((s) => s.state === "paid")).toBe(true);
    expect(states.every((s) => s.remaining === 0)).toBe(true);
  });

  it("orders by due date regardless of insertion order", () => {
    const shuffled = [plan[2], plan[0], plan[1]];
    const states = installmentPlan("s1", shuffled, [], TODAY);
    expect(states.map((s) => s.installment.id)).toEqual(["i1", "i2", "i3"]);
  });

  it("collects overdue installments across sales, oldest first", () => {
    const sales = [sale("s1", 8500, "confirmed"), sale("s2", 1000, "confirmed")];
    const installments = [...plan, installment("i4", "s2", 1000, "2026-07-01")];
    const overdue = overdueInstallments(sales, installments, [], TODAY);
    expect(overdue.map((o) => o.installment.id)).toEqual(["i4", "i1", "i2"]);
  });

  it("ignores installments of cancelled sales", () => {
    const overdue = overdueInstallments([sale("s1", 8500, "cancelled")], plan, [], TODAY);
    expect(overdue).toHaveLength(0);
  });
});

describe("profit & loss", () => {
  const sales = [sale("s1", 5000, "confirmed"), sale("s2", 4000, "cancelled")];
  const payments = [
    payment("p1", "s1", 2000, "2026-09-03"),
    payment("p2", "s1", 1000, "2026-10-02"), // outside the window
    payment("p3", "s2", 4000, "2026-09-04") // cancelled sale — never income
  ];
  const expenses = [
    expense("e1", 800, "materials", "2026-09-02"),
    expense("e2", 200, "transport", "2026-09-30"),
    expense("e3", 5000, "equipment", "2026-08-31") // outside the window
  ];

  it("counts only payments on counting sales inside the range", () => {
    expect(profitLoss(sales, payments, expenses, "2026-09-01", "2026-09-30")).toEqual({
      income: 2000,
      expenses: 1000,
      net: 1000
    });
  });

  it("reports a negative net when spending outruns income", () => {
    expect(profitLoss(sales, [], expenses, "2026-09-01", "2026-09-30").net).toBe(-1000);
  });

  it("includes both range boundaries", () => {
    expect(profitLoss(sales, payments, [], "2026-09-03", "2026-09-03").income).toBe(2000);
  });

  it("buckets expenses by category, largest first", () => {
    expect(expensesByCategory(expenses, "2026-09-01", "2026-09-30")).toEqual([
      { category: "materials", amount: 800 },
      { category: "transport", amount: 200 }
    ]);
  });
});

describe("expense breakdown shares", () => {
  const expenses = [
    expense("e1", 750, "materials", "2026-09-02"),
    expense("e2", 250, "transport", "2026-09-10")
  ];

  it("adds each category's share of the range total", () => {
    expect(expenseBreakdown(expenses, "2026-09-01", "2026-09-30")).toEqual([
      { category: "materials", amount: 750, share: 0.75 },
      { category: "transport", amount: 250, share: 0.25 }
    ]);
  });

  it("returns an empty list (no division by zero) for an empty range", () => {
    expect(expenseBreakdown(expenses, "2026-10-01", "2026-10-31")).toEqual([]);
  });
});

describe("sale progress", () => {
  it("is the paid share of the total, clamped at 1", () => {
    const s = sale("s1", 8500, "confirmed");
    expect(saleBalance(s, []).progress).toBe(0);
    expect(saleBalance(s, [payment("p1", "s1", 4250)]).progress).toBe(0.5);
    expect(saleBalance(s, [payment("p1", "s1", 9000)]).progress).toBe(1);
  });

  it("is 0 for a zero-amount sale with no payments", () => {
    expect(saleBalance(sale("s1", 0, "confirmed"), []).progress).toBe(0);
  });
});

describe("generating a payment plan", () => {
  it("splits the total so the cuotas sum EXACTLY to the sale", () => {
    const plan = generateInstallmentSchedule(8500, 3, "2026-10-01", "monthly");
    expect(plan.map((p) => p.amount)).toEqual([2833.34, 2833.33, 2833.33]);
    expect(sumMoney(plan.map((p) => p.amount))).toBe(8500);
  });

  it("spaces monthly cuotas by month, clamping short months", () => {
    const plan = generateInstallmentSchedule(900, 3, "2026-01-31", "monthly");
    expect(plan.map((p) => p.dueDate)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("spaces biweekly cuotas 15 days apart, across a month boundary", () => {
    const plan = generateInstallmentSchedule(600, 3, "2026-09-25", "biweekly");
    expect(plan.map((p) => p.dueDate)).toEqual(["2026-09-25", "2026-10-10", "2026-10-25"]);
  });

  it("returns nothing for a non-positive count", () => {
    expect(generateInstallmentSchedule(8500, 0, "2026-10-01", "monthly")).toEqual([]);
  });
});

describe("economics — was it worth it?", () => {
  const sales = [
    { ...sale("s1", 8500, "confirmed"), projectId: "p1", eventId: "e1" },
    { ...sale("s2", 2000, "delivered"), projectId: "p1", eventId: null },
    { ...sale("s3", 9000, "quoted"), projectId: "p1", eventId: "e1" },
    { ...sale("s4", 5000, "cancelled"), projectId: "p1", eventId: "e1" }
  ];
  const payments = [payment("pay1", "s1", 3000), payment("pay2", "s2", 2000)];
  const expenses = [
    { ...expense("x1", 1200, "materials", "2026-09-02"), projectId: "p1" },
    { ...expense("x2", 300, "transport", "2026-09-03"), projectId: "p1" },
    { ...expense("x3", 4000, "expo", "2026-09-04"), eventId: "e1" },
    { ...expense("x4", 999, "materials", "2026-09-05"), projectId: "p2" }
  ];

  it("a piece: revenue and spend counted only from what is linked to it", () => {
    const e = projectEconomics("p1", sales, payments, expenses);
    expect(e.revenue).toBe(10500); // quoted and cancelled excluded
    expect(e.collected).toBe(5000);
    expect(e.spent).toBe(1500); // p2's expense excluded
    expect(e.margin).toBe(9000);
    expect(e.cash).toBe(3500);
  });

  it("an expo can come out negative, and says so", () => {
    const e = expoEconomics("e1", sales, payments, expenses);
    expect(e.revenue).toBe(8500);
    expect(e.spent).toBe(4000);
    expect(e.margin).toBe(4500);

    const flop = expoEconomics("e1", [sales[3]], [], expenses);
    expect(flop.revenue).toBe(0);
    expect(flop.margin).toBe(-4000);
  });

  it("an unlinked piece has nothing attributed to it", () => {
    expect(projectEconomics("nope", sales, payments, expenses)).toEqual({
      revenue: 0,
      collected: 0,
      spent: 0,
      margin: 0,
      cash: 0
    });
  });
});

describe("margins per piece and per expo", () => {
  const sales = [
    { ...sale("s1", 8000, "delivered"), projectId: "p1" },
    { ...sale("s2", 1000, "confirmed"), projectId: "p2", eventId: "e1" },
    { ...sale("s3", 4000, "cancelled"), projectId: "p4", eventId: "e2" }
  ];
  const payments = [payment("pay1", "s1", 8000)];
  const expenses = [
    { ...expense("x1", 2000, "materials", "2026-09-02"), projectId: "p1" },
    { ...expense("x2", 3500, "materials", "2026-09-03"), projectId: "p3" },
    { ...expense("x3", 900, "expo", "2026-09-04"), eventId: "e1" }
  ];

  it("keeps only pieces with a linked sale or expense, best margin first", () => {
    const rows = projectMargins(["p1", "p2", "p3", "p5"], sales, payments, expenses);
    expect(rows.map((r) => [r.id, r.economics.margin])).toEqual([
      ["p1", 6000],
      ["p2", 1000],
      ["p3", -3500]
    ]);
    expect(rows[0].economics).toMatchObject({ revenue: 8000, spent: 2000, collected: 8000 });
    expect(rows[2].economics).toMatchObject({ revenue: 0, spent: 3500 });
  });

  it("a piece linked only to a cancelled sale still shows, at zero", () => {
    const rows = projectMargins(["p4"], sales, payments, expenses);
    expect(rows).toHaveLength(1);
    expect(rows[0].economics).toMatchObject({ revenue: 0, spent: 0, margin: 0 });
  });

  it("expos keep the caller's order and can come out negative", () => {
    const rows = expoMargins(["e2", "e1", "e3"], sales, payments, expenses);
    expect(rows.map((r) => [r.id, r.economics.margin])).toEqual([
      ["e2", 0],
      ["e1", 100]
    ]);
  });
});

describe("clientBalances", () => {
  it("puts whoever owes the most first and skips settled-but-smaller buyers correctly", () => {
    const sales = [
      sale("s1", 5000, "confirmed", "c1"),
      sale("s2", 1000, "confirmed", "c2"),
      sale("s3", 9000, "delivered", "c3")
    ];
    const payments = [payment("p1", "s1", 1000), payment("p3", "s3", 9000)];
    const rows = clientBalances(sales, payments);
    expect(rows.map((r) => [r.contactId, r.owed])).toEqual([
      ["c1", 4000],
      ["c2", 1000],
      ["c3", 0]
    ]);
    expect(rows[2]).toMatchObject({ committed: 9000, collected: 9000, saleCount: 1 });
  });

  it("ignores sales with no client and sales that don't count", () => {
    const sales = [
      { ...sale("s1", 5000, "confirmed"), contactId: null },
      sale("s2", 1000, "quoted", "c2"),
      sale("s3", 700, "cancelled", "c3")
    ];
    expect(clientBalances(sales, [])).toEqual([]);
  });

  it("aggregates several sales for the same client", () => {
    const sales = [sale("s1", 1000, "confirmed", "c1"), sale("s2", 2500, "delivered", "c1")];
    const rows = clientBalances(sales, [payment("p1", "s1", 400)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ contactId: "c1", committed: 3500, collected: 400, owed: 3100, saleCount: 2 });
  });
});
