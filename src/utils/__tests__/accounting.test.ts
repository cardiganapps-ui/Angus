import { describe, expect, it } from "vitest";
import type { Expense, Installment, Payment, Sale, SaleStatus } from "../../types";
import { sumMoney } from "../money";
import {
  budgetProgress,
  clientBalances,
  contactOwed,
  expenseBreakdown,
  expensesByCategory,
  expoEconomics,
  expoMargins,
  generateInstallmentSchedule,
  incomeByCategory,
  installmentPlan,
  overdueInstallments,
  paidForSale,
  planMismatch,
  profitLoss,
  rebuildPlan,
  refundableInRange,
  projectEconomics,
  projectMargins,
  saleBalance,
  saleCountsTowardRevenue,
  saleIsClosed,
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
    category: "piece",
    paymentTerms: "single",
    projectId: null,
    contactId,
    eventId: null,
    recurringRuleId: null,
    periodKey: null,
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
    courseId: null,
    method: null,
    recurringRuleId: null,
    periodKey: null,
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

  it("closes a sale only when it is delivered AND fully paid", () => {
    expect(saleIsClosed(sale("s1", 1000, "delivered"), [payment("p1", "s1", 1000)])).toBe(true);
    // Delivered but still owed — she has to chase it.
    expect(saleIsClosed(sale("s1", 1000, "delivered"), [payment("p1", "s1", 400)])).toBe(false);
    // Paid in full but not delivered — the piece is still hers to make.
    expect(saleIsClosed(sale("s1", 1000, "confirmed"), [payment("p1", "s1", 1000)])).toBe(false);
    // Quoted and cancelled owe nothing, which is NOT the same as closed.
    expect(saleIsClosed(sale("s1", 1000, "quoted"), [])).toBe(false);
    expect(saleIsClosed(sale("s1", 1000, "cancelled"), [payment("p1", "s1", 1000)])).toBe(false);
  });

  it("closes a delivered sale that was overpaid", () => {
    expect(saleIsClosed(sale("s1", 1000, "delivered"), [payment("p1", "s1", 1200)])).toBe(true);
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
      credit: 0,
      // s4 was cancelled after taking 7000. That cash is real and hers
      // to give back — it used to disappear from every figure while its
      // payment row sat in the database.
      refundable: 7000
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
    expect(totals([], [])).toEqual({ committed: 0, paid: 0, owed: 0, credit: 0, refundable: 0 });
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
  // No `sales` fixture: profitLoss does not take them, which is the fix.
  const payments = [
    payment("p1", "s1", 2000, "2026-09-03"),
    payment("p2", "s1", 1000, "2026-10-02"), // outside the window
    payment("p3", "s2", 4000, "2026-09-04") // on a sale cancelled later
  ];
  const expenses = [
    expense("e1", 800, "materials", "2026-09-02"),
    expense("e2", 200, "transport", "2026-09-30"),
    expense("e3", 5000, "equipment", "2026-08-31") // outside the window
  ];

  /* Cash basis: every payment inside the range, whatever its sale's
     status is TODAY. Cash that arrived in September arrived; the duty to
     return some of it is a liability (totals().refundable), not a
     retroactive edit to a month she has already read. */
  it("counts every payment inside the range, regardless of sale status", () => {
    expect(profitLoss(payments, expenses, "2026-09-01", "2026-09-30")).toEqual({
      income: 6000, // 2000 on the live sale + 4000 on the cancelled one
      expenses: 1000,
      net: 5000
    });
  });

  /* The regression this replaced: profitLoss keyed income off each
     sale's CURRENT status, so cancelling in October rewrote September's
     net. It no longer takes `sales` at all — the invariant is now
     structural, not merely asserted — and this pins the consequence:
     the cancelled sale's September payment still counts as September
     cash. What she owes back is totals().refundable. */
  it("keeps a cancelled sale's payment in the month it was received", () => {
    const only = [payment("p3", "s2", 4000, "2026-09-04")];
    expect(profitLoss(only, [], "2026-09-01", "2026-09-30").income).toBe(4000);
  });

  it("reports a negative net when spending outruns income", () => {
    expect(profitLoss([], expenses, "2026-09-01", "2026-09-30").net).toBe(-1000);
  });

  it("includes both range boundaries", () => {
    expect(profitLoss(payments, [], "2026-09-03", "2026-09-03").income).toBe(2000);
  });

  it("buckets expenses by category, largest first", () => {
    expect(expensesByCategory(expenses, "2026-09-01", "2026-09-30")).toEqual([
      { category: "materials", amount: 800 },
      { category: "transport", amount: 200 }
    ]);
  });
});

describe("refundableInRange", () => {
  const sales = [
    sale("s1", 10000, "confirmed"),
    sale("s2", 8000, "cancelled"),
    sale("s3", 900, "quoted")
  ];
  const payments = [
    payment("p1", "s1", 2000, "2026-09-03"),
    payment("p2", "s2", 4000, "2026-09-04"), // deposit on the cancelled one
    payment("p3", "s2", 1500, "2026-08-20"), // same sale, earlier month
    payment("p4", "s3", 900, "2026-09-07") // quoted, never cancelled
  ];

  it("counts only payments in the range whose sale is cancelled", () => {
    expect(refundableInRange(sales, payments, "2026-09-01", "2026-09-30")).toBe(4000);
    expect(refundableInRange(sales, payments, "2026-08-01", "2026-08-31")).toBe(1500);
  });

  /* The whole point of scoping it: totals().refundable is the standing
     liability across all time, this is the slice of ONE period's cash
     that isn't hers. A deposit taken in August and cancelled in
     September belongs to August's slice and to today's total alike. */
  it("differs from the all-time liability when the two fall in different months", () => {
    expect(totals(sales, payments).refundable).toBe(5500);
    expect(refundableInRange(sales, payments, "2026-09-01", "2026-09-30")).toBe(4000);
  });

  /* INVARIANT: always a subset of the same range's cash income, so
     `income − refundableInRange` can never go negative. */
  it("never exceeds the range's income", () => {
    const income = profitLoss(payments, [], "2026-09-01", "2026-09-30").income;
    expect(refundableInRange(sales, payments, "2026-09-01", "2026-09-30")).toBeLessThanOrEqual(income);
  });

  it("is zero with nothing cancelled, and includes both boundaries", () => {
    expect(refundableInRange([sales[0]], payments, "2026-09-01", "2026-09-30")).toBe(0);
    expect(refundableInRange(sales, payments, "2026-09-04", "2026-09-04")).toBe(4000);
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

describe("incomeByCategory", () => {
  it("attributes each payment to its sale's category, cash basis, with shares", () => {
    const sales = [
      { ...sale("s1", 5000, "confirmed"), category: "piece" as const },
      { ...sale("s2", 1800, "confirmed"), category: "class" as const },
      { ...sale("s3", 900, "quoted"), category: "class" as const }
    ];
    const payments = [
      payment("p1", "s1", 2000, "2026-09-05"),
      payment("p2", "s2", 1800, "2026-09-06"),
      payment("p3", "s3", 900, "2026-09-07"),
      payment("p4", "s1", 3000, "2026-10-01")
    ];
    /* s3 is `quoted` and its 900 was received in the range. It counts.
       This assertion used to read 1800 / 3800 — excluding it — because
       the lookup filtered by saleCountsTowardRevenue. That made the
       breakdown disagree with profitLoss (and with the "Cobrado" KPI
       rendered directly above it in Reportes), which counts every payment
       in the range whatever its sale's status. The old expectation pinned
       that asymmetry as correct; it was the bug. */
    expect(incomeByCategory(sales, payments, "2026-09-01", "2026-09-30")).toEqual([
      { category: "class", amount: 2700, share: 2700 / 4700 },
      { category: "piece", amount: 2000, share: 2000 / 4700 }
    ]);
  });

  /* The invariant that makes Reportes internally consistent: the parts add
     up to the whole. Any status filter reintroduced into incomeByCategory
     breaks this and the screen starts lying again. */
  it("sums exactly to profitLoss income over the same range — headline ties to breakdown", () => {
    const sales = [
      { ...sale("s1", 12000, "confirmed"), category: "commission" as const },
      { ...sale("s2", 1800, "cancelled"), category: "class" as const },
      { ...sale("s3", 900, "quoted"), category: "workshop" as const },
      { ...sale("s4", 4000, "delivered"), category: "piece" as const }
    ];
    const payments = [
      payment("p1", "s1", 6000, "2026-09-05"),
      payment("p2", "s2", 1800, "2026-09-06"),
      payment("p3", "s3", 900, "2026-09-07"),
      payment("p4", "s4", 4000, "2026-09-08"),
      payment("p5", "s1", 6000, "2026-10-01")
    ];
    const from = "2026-09-01";
    const to = "2026-09-30";
    const breakdown = incomeByCategory(sales, payments, from, to);
    const headline = profitLoss(payments, [], from, to).income;

    expect(headline).toBe(12700);
    expect(sumMoney(breakdown.map((r) => r.amount))).toBe(headline);
    // ...including the deposit on the cancelled sale, which is real cash.
    expect(breakdown.find((r) => r.category === "class")?.amount).toBe(1800);
    expect(breakdown.reduce((n, r) => n + r.share, 0)).toBeCloseTo(1, 10);
  });
});

describe("budgetProgress", () => {
  it("compares spend to each limit and flags near / over", () => {
    const expenses = [
      expense("e1", 900, "materials", "2026-09-03"),
      expense("e2", 500, "materials", "2026-09-10"),
      expense("e3", 6500, "rent", "2026-09-01"),
      expense("e4", 100, "food", "2026-08-30")
    ];
    const rows = budgetProgress(
      expenses,
      { materials: 1200, rent: 6500, food: 800, transport: 0 },
      "2026-09-01",
      "2026-09-30"
    );
    expect(rows.map((r) => [r.category, r.state, r.remaining])).toEqual([
      ["materials", "over", 0],
      ["rent", "near", 0],
      ["food", "ok", 800]
    ]);
    expect(rows[0].ratio).toBe(1);
    expect(rows[2].spent).toBe(0);
  });
});

describe("generateInstallmentSchedule frequency steps", () => {
  /* The plan's quincenal is 15 days (the quincena shape), deliberately
     unlike a recurring rule's 14. Pinned so a "consistency" pass can't
     silently reschedule someone's payments. */
  it("steps a quincenal plan by 15 days", () => {
    const plan = generateInstallmentSchedule(900, 3, "2026-01-05", "biweekly");
    expect(plan.map((p) => p.dueDate)).toEqual(["2026-01-05", "2026-01-20", "2026-02-04"]);
  });

  it("steps a monthly plan by calendar months, clamping a short one", () => {
    const plan = generateInstallmentSchedule(900, 3, "2026-01-31", "monthly");
    expect(plan.map((p) => p.dueDate)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("splits so the cuotas add back to the total exactly", () => {
    const plan = generateInstallmentSchedule(1000, 3, "2026-01-01", "monthly");
    expect(plan.reduce((n, p) => n + p.amount, 0)).toBe(1000);
  });
});

describe("a cancelled sale's money is a liability, not a disappearance", () => {
  const cancelled = sale("s1", 12000, "cancelled");
  const deposit = [payment("p1", "s1", 5000)];

  /* The hole this closes: a $5 000 deposit on a cancelled commission
     vanished from every total while its payment row sat in the
     database. Cash received no longer equalled cash reported, and
     nothing on screen said she owed it back. */
  it("reports the deposit as refundable rather than dropping it", () => {
    const b = saleBalance(cancelled, deposit);
    expect(b.paid).toBe(5000);
    expect(b.refundable).toBe(5000);
    expect(b.owed).toBe(0);
    expect(b.credit).toBe(0);
  });

  it("is not settled while she still owes the money back", () => {
    expect(saleBalance(cancelled, deposit).settled).toBe(false);
    // A cancelled sale that never took a peso genuinely is settled.
    expect(saleBalance(cancelled, []).settled).toBe(true);
  });

  it("leaves a quoted sale settled and nothing refundable", () => {
    const b = saleBalance(sale("s2", 900, "quoted"), [payment("p2", "s2", 900)]);
    expect(b.refundable).toBe(0);
    expect(b.settled).toBe(true);
  });

  it("keeps the client on the balance list instead of hiding them", () => {
    const withContact: Sale = { ...cancelled, contactId: "c1" };
    const rows = clientBalances([withContact], deposit);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ contactId: "c1", refundable: 5000, owed: 0, saleCount: 0 });
  });

  it("drops a client with neither a counting sale nor a refund", () => {
    const withContact: Sale = { ...cancelled, contactId: "c1" };
    expect(clientBalances([withContact], [])).toHaveLength(0);
  });
});

/* ── The plan that stopped matching its sale ──
   Editing the amount of a sale that already had cuotas wrote `amount`
   alone: the plan kept promising the old total, forecast.ts projected
   income that wasn't owed and Hoy showed overdue cuotas for money
   nobody had agreed to. planMismatch is the detector; rebuildPlan is
   the repair. */
describe("planMismatch", () => {
  it("is null when there is no plan at all", () => {
    expect(planMismatch(sale("s1", 8500, "confirmed"), [])).toBeNull();
  });

  it("is null when the cuotas add back up to the sale, to the cent", () => {
    const plan = generateInstallmentSchedule(8500, 3, "2026-10-01", "monthly").map((row, i) =>
      installment(`i${i}`, "s1", row.amount, row.dueDate)
    );
    // 2833.34 + 2833.33 + 2833.33 — a float sum lands on 8499.999999999999.
    expect(planMismatch(sale("s1", 8500, "confirmed"), plan)).toBeNull();
  });

  it("reports a plan that asks for more than the sale", () => {
    const plan = [installment("i1", "s1", 5000, "2026-10-01"), installment("i2", "s1", 5000, "2026-11-01")];
    expect(planMismatch(sale("s1", 8500, "confirmed"), plan)).toEqual({
      planned: 10000,
      amount: 8500,
      difference: 1500,
      kind: "over"
    });
  });

  it("reports a plan that falls short of the sale", () => {
    const plan = [installment("i1", "s1", 4000, "2026-10-01")];
    expect(planMismatch(sale("s1", 8500, "confirmed"), plan)).toMatchObject({
      planned: 4000,
      difference: -4500,
      kind: "short"
    });
  });

  it("ignores another sale's cuotas", () => {
    const plan = [installment("i1", "s2", 9999, "2026-10-01")];
    expect(planMismatch(sale("s1", 8500, "confirmed"), plan)).toBeNull();
  });

  it("adds the cuotas in cents, so the figure it reports is exact", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in floating point, and a number
    // she reads on screen has to be the number, not almost the number.
    const plan = [installment("i1", "s1", 0.1, "2026-10-01"), installment("i2", "s1", 0.2, "2026-11-01")];
    expect(planMismatch(sale("s1", 0.5, "confirmed"), plan)).toEqual({
      planned: 0.3,
      amount: 0.5,
      difference: -0.2,
      kind: "short"
    });
  });
});

describe("rebuildPlan", () => {
  const dates = ["2026-08-01", "2026-09-01", "2026-10-01"];
  const threeOf = (...amounts: number[]) =>
    amounts.map((amount, i) => installment(`i${i + 1}`, "s1", amount, dates[i]));

  it("respreads an untouched plan over the new amount, keeping the due dates", () => {
    const plan = threeOf(2833.34, 2833.33, 2833.33);
    const next = rebuildPlan("s1", 10000, plan, [], TODAY);
    expect(next.rows.map((r) => [r.id, r.amount, r.dueDate])).toEqual([
      ["i1", 3333.35, "2026-08-01"],
      ["i2", 3333.33, "2026-09-01"],
      ["i3", 3333.32, "2026-10-01"]
    ]);
    expect(sumMoney(next.rows.map((r) => r.amount))).toBe(10000);
    expect(next.updates).toHaveLength(3);
    expect(next.removals).toEqual([]);
    expect(next.additions).toEqual([]);
  });

  it("leaves money already received where it is and respreads only the rest", () => {
    // 3000 received: i1 is covered in full, i2 partially.
    const plan = threeOf(3000, 3000, 2500);
    const next = rebuildPlan("s1", 12000, plan, [payment("p1", "s1", 3000)], TODAY);
    // The open pair keeps its 3000:2500 ratio across the new 9000.
    expect(next.rows.map((r) => [r.id, r.amount, r.paid])).toEqual([
      ["i1", 3000, true],
      ["i2", 4909.1, false],
      ["i3", 4090.9, false]
    ]);
    expect(next.updates).toEqual([
      { id: "i2", amount: 4909.1 },
      { id: "i3", amount: 4090.9 }
    ]);
    expect(sumMoney(next.rows.map((r) => r.amount))).toBe(12000);
  });

  it("writes nothing when every cuota is paid and the plan already lands on the amount", () => {
    const plan = [installment("i1", "s1", 3000, "2026-08-01"), installment("i2", "s1", 3000, "2026-09-01")];
    const next = rebuildPlan("s1", 6000, plan, [payment("p1", "s1", 6000)], TODAY);
    expect(next.unchanged).toBe(true);
    expect(next.updates).toEqual([]);
    expect(next.removals).toEqual([]);
  });

  /* A rebuild repairs the total; it must not redesign the plan. An
     anticipo/liquidación split is a decision she made, and spreading
     evenly would silently overwrite it with one nobody chose. */
  it("keeps a 30/70 shape instead of flattening it", () => {
    const plan = [installment("i1", "s1", 2550, "2026-09-01"), installment("i2", "s1", 5950, "2026-10-01")];
    const next = rebuildPlan("s1", 10000, plan, [], TODAY);
    expect(next.rows.map((r) => r.amount)).toEqual([3000, 7000]);
    expect(sumMoney(next.rows.map((r) => r.amount))).toBe(10000);
  });

  /* The property proportional scaling buys: rebuilding a plan that is
     already correct writes nothing at all. Under an even split every
     uneven plan produced three updates on every pass, and every write is
     a chance for the server to say no. */
  it("writes nothing when the plan already sums to the amount", () => {
    const plan = threeOf(3000, 2000, 4000);
    const next = rebuildPlan("s1", 9000, plan, [], TODAY);
    expect(next.rows.map((r) => r.amount)).toEqual([3000, 2000, 4000]);
    expect(next.updates).toEqual([]);
    expect(next.unchanged).toBe(true);
  });

  it("asks to write only the cuotas whose amount actually moves", () => {
    // i1's share of the new total is unchanged, so re-sending it would be
    // a write that changes nothing.
    const plan = threeOf(3000, 3000, 3000);
    const next = rebuildPlan("s1", 12000, plan, [], TODAY);
    expect(next.rows.map((r) => r.amount)).toEqual([4000, 4000, 4000]);
    expect(next.updates).toEqual([
      { id: "i1", amount: 4000 },
      { id: "i2", amount: 4000 },
      { id: "i3", amount: 4000 }
    ]);
  });

  it("leaves a sale with no plan alone rather than inventing one", () => {
    expect(rebuildPlan("s1", 8500, [], [], TODAY)).toEqual({
      rows: [],
      updates: [],
      removals: [],
      additions: [],
      unchanged: true
    });
  });

  it("adds a cuota when every one is paid and the sale grew", () => {
    const plan = [installment("i1", "s1", 3000, "2026-08-01"), installment("i2", "s1", 3000, "2026-09-01")];
    const next = rebuildPlan("s1", 8000, plan, [payment("p1", "s1", 6000)], TODAY);
    // Nothing left to spread onto: the difference becomes its own cuota,
    // due today because the plan no longer reaches into the future.
    expect(next.additions).toEqual([{ amount: 2000, dueDate: TODAY }]);
    expect(next.updates).toEqual([]);
    expect(next.rows.map((r) => r.amount)).toEqual([3000, 3000, 2000]);
    expect(sumMoney(next.rows.map((r) => r.amount))).toBe(8000);
  });

  it("dates that extra cuota with the plan's own tail when it is still ahead", () => {
    const plan = [installment("i1", "s1", 3000, "2026-10-01"), installment("i2", "s1", 3000, "2026-11-01")];
    const next = rebuildPlan("s1", 7000, plan, [payment("p1", "s1", 6000)], TODAY);
    expect(next.additions).toEqual([{ amount: 1000, dueDate: "2026-11-01" }]);
  });

  it("drops the pending cuotas when the new amount is already covered", () => {
    const plan = threeOf(3000, 3000, 2500);
    const next = rebuildPlan("s1", 3000, plan, [payment("p1", "s1", 3000)], TODAY);
    expect(next.removals).toEqual(["i2", "i3"]);
    expect(next.rows.map((r) => [r.id, r.amount])).toEqual([["i1", 3000]]);
    expect(sumMoney(next.rows.map((r) => r.amount))).toBe(3000);
  });

  it("trims the plan when she reduces the amount below what is already paid", () => {
    const plan = threeOf(3000, 3000, 2500);
    const next = rebuildPlan("s1", 4000, plan, [payment("p1", "s1", 8500)], TODAY);
    // Every cuota was paid; the total drops to 4000, so the plan keeps
    // i1 whole, trims i2 to what is left and drops i3. The payments are
    // untouched — the surplus is the sale's `credit`, not a rewrite.
    expect(next.rows.map((r) => [r.id, r.amount])).toEqual([
      ["i1", 3000],
      ["i2", 1000]
    ]);
    expect(next.updates).toEqual([{ id: "i2", amount: 1000 }]);
    expect(next.removals).toEqual(["i3"]);
    expect(sumMoney(next.rows.map((r) => r.amount))).toBe(4000);
    expect(saleBalance(sale("s1", 4000, "confirmed"), [payment("p1", "s1", 8500)]).credit).toBe(4500);
  });

  it("clears the plan for a zero amount instead of leaving orphan cuotas", () => {
    const next = rebuildPlan("s1", 0, threeOf(3000, 3000, 2500), [], TODAY);
    expect(next.rows).toEqual([]);
    expect(next.removals).toEqual(["i1", "i2", "i3"]);
  });

  /* The whole point of the rebuild: whatever the shape of the plan and
     of the money already received, the cuotas add back up to the sale
     EXACTLY — in cents, not to within a rounding error. */
  it("always lands on the sale amount, to the cent", () => {
    const shapes: { plan: Installment[]; payments: Payment[] }[] = [
      { plan: threeOf(2833.34, 2833.33, 2833.33), payments: [] },
      { plan: threeOf(3000, 3000, 2500), payments: [payment("p1", "s1", 3000)] },
      { plan: threeOf(3000, 3000, 2500), payments: [payment("p1", "s1", 8500)] },
      { plan: threeOf(0.01, 0.01, 0.01), payments: [payment("p1", "s1", 0.01)] },
      { plan: [installment("i1", "s1", 100, "2026-08-01")], payments: [payment("p1", "s1", 100)] }
    ];
    for (const { plan, payments } of shapes) {
      for (const amount of [0.03, 100, 1000.01, 8500, 33333.33]) {
        const next = rebuildPlan("s1", amount, plan, payments, TODAY);
        expect(sumMoney(next.rows.map((r) => r.amount))).toBe(amount);
        // And what it says to write reproduces exactly those rows.
        const written = new Map(plan.map((i) => [i.id, i.amount]));
        for (const u of next.updates) written.set(u.id, u.amount);
        for (const id of next.removals) written.delete(id);
        expect(sumMoney([...written.values(), ...next.additions.map((a) => a.amount)])).toBe(amount);
      }
    }
  });
});
