import { describe, expect, it } from "vitest";
import type { Contact, Expense, Installment, Payment, Project, Sale, ScheduleEvent } from "../../types";
import { attentionItems, moneyPulse, monthlyTrend, practiceSnapshot } from "../dashboard";

const TODAY = "2026-09-15";

function sale(id: string, amount: number, over: Partial<Sale> = {}): Sale {
  return {
    id,
    title: `Venta ${id}`,
    amount,
    date: "2026-09-10",
    status: "confirmed",
    projectId: null,
    contactId: "c1",
    eventId: null,
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
  id, title: `Gasto ${id}`, amount, date, category: "materials",
  projectId: null, eventId: null, notes: "", createdAt: date
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
