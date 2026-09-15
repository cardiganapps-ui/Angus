import { describe, expect, it } from "vitest";
import type { Contact, Expense, Installment, Payment, Project, Sale, ScheduleEvent } from "../../types";
import {
  attentionItems,
  goalProgress,
  moneyPulse,
  monthlyTrend,
  netDelta,
  practiceSnapshot,
  trendChart,
  type MonthPoint
} from "../dashboard";

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
const payment = (id: string, saleId: string, amount: number, date = "2026-09-11"): Payment => ({
  id, saleId, amount, date, method: "transfer", notes: "", createdAt: date
});
const installment = (id: string, saleId: string, amount: number, dueDate: string): Installment => ({
  id, saleId, amount, dueDate, notes: "", createdAt: "2026-09-01"
});
const expense = (id: string, amount: number, date: string): Expense => ({
  id, title: `Gasto ${id}`, amount, date, category: "materials", method: null,
  projectId: null, eventId: null, recurringRuleId: null, periodKey: null, notes: "", createdAt: date
});
function contact(id: string, over: Partial<Contact> = {}): Contact {
  return {
    id, name: `Contacto ${id}`, relationship: "lead", email: "", phone: "",
    leadStage: "contacted", followUpDate: null, notes: "", createdAt: "2026-09-01", ...over
  };
}
function project(id: string, over: Partial<Project> = {}): Project {
  return {
    id, title: `Pieza ${id}`, medium: "Óleo", status: "in_progress",
    startDate: null, dueDate: null, price: null, contactId: null,
    notes: "", createdAt: "2026-09-01", ...over
  };
}
const event = (id: string, kind: ScheduleEvent["kind"], date: string): ScheduleEvent => ({
  id, title: `Evento ${id}`, kind, date, startTime: null, endTime: null,
  location: "", projectId: null, contactId: null, notes: "", createdAt: date
});

describe("attentionItems", () => {
  const sources = {
    sales: [sale("s1", 5000)],
    payments: [] as Payment[],
    installments: [installment("i1", "s1", 2500, "2026-09-01")],
    contacts: [
      contact("c1", { followUpDate: "2026-09-10" }),
      contact("c2", { followUpDate: "2026-12-01" }),
      contact("c3")
    ],
    projects: [
      project("p1", { dueDate: "2026-09-12" }),
      project("p2", { dueDate: "2026-09-18" }),
      project("p3", { dueDate: "2026-10-30" }),
      project("p4", { dueDate: "2026-09-01", status: "completed" })
    ]
  };

  it("gathers overdue money, due follow-ups and near deadlines, most overdue first", () => {
    const items = attentionItems(sources, TODAY);
    expect(items.map((i) => i.key)).toEqual([
      "installment:i1", // 1 sep
      "followup:c1", // 10 sep
      "deadline:p1", // 12 sep
      "deadline:p2" // 18 sep, inside the 7-day horizon
    ]);
  });

  it("signs days so overdue is negative and upcoming positive", () => {
    const items = attentionItems(sources, TODAY);
    expect(items[0].daysUntil).toBe(-14);
    expect(items[3].daysUntil).toBe(3);
  });

  it("carries the money still owed on an overdue installment", () => {
    const items = attentionItems(sources, TODAY);
    expect(items[0]).toMatchObject({ kind: "installment", saleId: "s1", amount: 2500, contactId: "c1" });
  });

  it("leaves out what isn't due yet, has no date, or is already done", () => {
    const keys = attentionItems(sources, TODAY).map((i) => i.key);
    expect(keys).not.toContain("followup:c2"); // december
    expect(keys).not.toContain("followup:c3"); // no follow-up set
    expect(keys).not.toContain("deadline:p3"); // beyond the horizon
    expect(keys).not.toContain("deadline:p4"); // completed
  });

  it("drops an installment once it is covered by payments", () => {
    const items = attentionItems({ ...sources, payments: [payment("pay1", "s1", 2500)] }, TODAY);
    expect(items.map((i) => i.kind)).not.toContain("installment");
  });

  it("is empty when everything is in hand", () => {
    expect(
      attentionItems({ sales: [], payments: [], installments: [], contacts: [], projects: [] }, TODAY)
    ).toEqual([]);
  });
});

describe("monthlyTrend", () => {
  const sales = [sale("s1", 10000)];
  const payments = [
    payment("p1", "s1", 3000, "2026-07-05"),
    payment("p2", "s1", 2000, "2026-09-02")
  ];
  const expenses = [expense("e1", 1000, "2026-08-20"), expense("e2", 500, "2026-09-03")];

  it("returns one point per month, oldest first, spanning the year boundary", () => {
    const points = monthlyTrend(sales, payments, expenses, "2026-02-15", 4);
    expect(points.map((p) => p.month)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("splits income and expenses into the right months", () => {
    const points = monthlyTrend(sales, payments, expenses, TODAY, 3);
    expect(points).toEqual([
      { month: "2026-07", income: 3000, expenses: 0, net: 3000 },
      { month: "2026-08", income: 0, expenses: 1000, net: -1000 },
      { month: "2026-09", income: 2000, expenses: 500, net: 1500 }
    ]);
  });

  it("anchors on the 1st so a 31st can't clamp into the wrong month", () => {
    expect(monthlyTrend([], [], [], "2026-03-31", 2).map((p) => p.month)).toEqual(["2026-02", "2026-03"]);
  });
});

describe("moneyPulse", () => {
  const sales = [sale("s1", 10000)];
  const payments = [payment("p1", "s1", 4000, "2026-08-10"), payment("p2", "s1", 2000, "2026-09-02")];
  const expenses = [expense("e1", 500, "2026-09-03")];

  it("reports this month and how it compares with last", () => {
    const pulse = moneyPulse(sales, payments, expenses, TODAY);
    expect(pulse).toMatchObject({ income: 2000, expenses: 500, net: 1500, owed: 4000 });
    expect(pulse.netChange).toBe(-2500); // august netted 4000
  });

  it("has no comparison when there is no prior month to compare with", () => {
    expect(moneyPulse(sales, [payment("p", "s1", 100, "2026-09-05")], [], TODAY).netChange).toBeNull();
  });
});

describe("trendChart", () => {
  const point = (month: string, net: number): MonthPoint => ({
    month,
    income: net > 0 ? net : 0,
    expenses: net < 0 ? -net : 0,
    net
  });

  it("puts the zero line where the peaks divide the box and scales both sides alike", () => {
    const chart = trendChart(
      [point("2026-07", 3000), point("2026-08", -1000), point("2026-09", 1500)],
      "2026-09"
    );
    // Span is 4000: 3000 above the line, 1000 below → 3/4 of the box on top.
    expect(chart.zeroLine).toBeCloseTo(0.75);
    expect(chart.bars.map((b) => b.height)).toEqual([0.75, 0.25, 0.375]);
    expect(chart.bars.map((b) => b.positive)).toEqual([true, false, true]);
    expect(chart.max).toBe(3000);
    expect(chart.min).toBe(-1000);
  });

  it("survives an all-zero window with a flat baseline and no NaN", () => {
    const chart = trendChart([point("2026-08", 0), point("2026-09", 0)], "2026-09");
    expect(chart.zeroLine).toBe(1);
    expect(chart.bars.every((b) => b.height === 0)).toBe(true);
    expect(chart.bars.every((b) => Number.isFinite(b.height))).toBe(true);
    expect(chart).toMatchObject({ max: 0, min: 0 });
  });

  it("survives an empty window", () => {
    expect(trendChart([], "2026-09")).toEqual({ bars: [], zeroLine: 1, max: 0, min: 0 });
  });

  it("gives the whole box to one side when the window has only one sign", () => {
    const up = trendChart([point("2026-08", 0), point("2026-09", 900)], "2026-09");
    expect(up.zeroLine).toBe(1);
    expect(up.bars.map((b) => b.height)).toEqual([0, 1]);

    const down = trendChart([point("2026-08", 0), point("2026-09", -900)], "2026-09");
    expect(down.zeroLine).toBe(0);
    expect(down.bars.map((b) => b.height)).toEqual([0, 1]);
  });

  it("keeps a single dominant month from erasing the others", () => {
    const chart = trendChart(
      [point("2026-07", 100), point("2026-08", 200), point("2026-09", 10000)],
      "2026-09"
    );
    expect(chart.bars.map((b) => b.height)).toEqual([0.01, 0.02, 1]);
  });

  it("marks the current month", () => {
    const chart = trendChart([point("2026-08", 10), point("2026-09", 20)], "2026-09");
    expect(chart.bars.map((b) => b.current)).toEqual([false, true]);
  });

  it("counts cents exactly rather than drifting on floats", () => {
    const chart = trendChart([point("2026-08", 0.1), point("2026-09", 0.2)], "2026-09");
    expect(chart.bars.map((b) => b.height)).toEqual([0.5, 1]);
  });
});

describe("netDelta", () => {
  it("splits the change into a size and a direction", () => {
    expect(netDelta(2500, TODAY)).toEqual({
      direction: "up",
      magnitude: 2500,
      previousMonth: "2026-08"
    });
    expect(netDelta(-2500, TODAY)).toEqual({
      direction: "down",
      magnitude: 2500,
      previousMonth: "2026-08"
    });
    expect(netDelta(0, TODAY)).toMatchObject({ direction: "flat", magnitude: 0 });
  });

  it("stays null when there is nothing to compare against", () => {
    expect(netDelta(null, TODAY)).toBeNull();
  });

  it("steps back across the year boundary", () => {
    expect(netDelta(10, "2026-01-31")?.previousMonth).toBe("2025-12");
  });
});

describe("practiceSnapshot", () => {
  const projects = [
    project("p1"),
    project("p2"),
    project("p3", { status: "idea" }),
    project("p4", { status: "on_hold" }),
    project("p5", { status: "completed" })
  ];
  const events = [
    event("e1", "class", "2026-09-16"),
    event("e2", "class", "2026-10-30"),
    event("e3", "expo", "2026-09-25"),
    event("e4", "meeting", "2026-09-15"),
    event("e5", "class", "2026-09-01")
  ];
  const sales = [
    sale("s1", 4000, { date: "2026-09-05" }),
    sale("s2", 1000, { date: "2026-08-30" }),
    sale("s3", 9000, { date: "2026-09-08", status: "quoted" })
  ];

  it("counts work in progress and parked work separately", () => {
    const snap = practiceSnapshot(projects, events, sales, TODAY);
    expect(snap.inProgress).toBe(2);
    expect(snap.parked).toBe(2);
  });

  it("counts only counting sales agreed this month", () => {
    const snap = practiceSnapshot(projects, events, sales, TODAY);
    expect(snap.soldThisMonth).toBe(1);
    expect(snap.soldThisMonthAmount).toBe(4000);
  });

  it("looks ahead for classes and finds the next expo and next event", () => {
    const snap = practiceSnapshot(projects, events, sales, TODAY);
    expect(snap.classesAhead).toBe(1); // 16 sep only; october is past the horizon, 1 sep is behind
    expect(snap.nextExpo?.id).toBe("e3");
    expect(snap.nextEvent?.id).toBe("e4"); // today counts as upcoming
  });

  it("is safe on an empty practice", () => {
    const snap = practiceSnapshot([], [], [], TODAY);
    expect(snap).toMatchObject({ inProgress: 0, parked: 0, soldThisMonth: 0, nextExpo: null, nextEvent: null });
  });
});

describe("goalProgress", () => {
  it("is null without a goal", () => {
    expect(goalProgress(500, null)).toBeNull();
    expect(goalProgress(500, 0)).toBeNull();
  });

  it("reports the ratio, the remainder and whether it was reached", () => {
    expect(goalProgress(2500, 10000)).toEqual({
      collected: 2500,
      goal: 10000,
      remaining: 7500,
      ratio: 0.25,
      reached: false
    });
  });

  it("clamps at 100% and never reports a negative remainder", () => {
    const p = goalProgress(12000, 10000)!;
    expect(p.ratio).toBe(1);
    expect(p.remaining).toBe(0);
    expect(p.reached).toBe(true);
  });
});
