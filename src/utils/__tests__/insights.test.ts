import { describe, expect, it } from "vitest";
import type { Contact, Expense, Payment, Project, Sale } from "../../types";
import { avgDaysToCollect, bestMonths, delta, leadFunnel, periodSummary, salesByMedium, topClients } from "../insights";

const Y = { from: "2026-01-01", to: "2026-12-31" };

function sale(id: string, amount: number, over: Partial<Sale> = {}): Sale {
  return {
    id, title: id, amount, date: "2026-03-10", status: "confirmed", category: "piece", paymentTerms: "single",
    projectId: null, contactId: "c1", eventId: null, recurringRuleId: null, periodKey: null, notes: "", createdAt: "2026-03-10", ...over
  };
}
const payment = (id: string, saleId: string, amount: number, date: string): Payment => ({
  id, saleId, amount, date, method: "transfer", notes: "", createdAt: date
});
const expense = (id: string, amount: number, date: string): Expense => ({
  id, title: id, amount, date, category: "materials", method: null, projectId: null, eventId: null,
  courseId: null,
  recurringRuleId: null, periodKey: null, notes: "", createdAt: date
});
const project = (id: string, medium: string): Project => ({
  id, title: id, medium, status: "completed", availability: "available", startDate: null, dueDate: null, price: null, cost: null, dimensions: "", year: null, edition: "", location: "", contactId: null, courseId: null, notes: "", createdAt: "2026-01-01"
});
const contact = (id: string, name: string, over: Partial<Contact> = {}): Contact => ({
  id, name, relationship: "client", email: "", phone: "", leadStage: null, followUpDate: null, notes: "", createdAt: "2026-02-01", ...over
});

describe("periodSummary", () => {
  it("counts pieces, average price and payments on a cash basis", () => {
    const sales = [
      sale("s1", 8000),
      sale("s2", 4000, { category: "commission" }),
      sale("s3", 1800, { category: "class" }),
      sale("s4", 999, { status: "quoted" })
    ];
    const payments = [payment("p1", "s1", 8000, "2026-03-12"), payment("p2", "s3", 1800, "2026-04-01"), payment("p3", "s4", 999, "2026-04-01")];
    const s = periodSummary(sales, payments, [expense("e1", 500, "2026-05-05")], Y.from, Y.to);
    expect(s).toEqual({
      // Cash basis: s4 is only quoted, but its 999 arrived, so it counts
      // here and in paymentsCount. The ledger side (salesCount,
      // piecesSold) still excludes it — a quote is not a sale.
      income: 10799,
      expenses: 500,
      net: 10299,
      salesCount: 3,
      piecesSold: 2,
      avgPiecePrice: 6000,
      paymentsCount: 3
    });
  });
});

describe("delta", () => {
  it("computes change and percent, null percent from zero", () => {
    expect(delta(1200, 1000)).toEqual({ current: 1200, previous: 1000, change: 200, percent: 20 });
    expect(delta(500, 0).percent).toBeNull();
    expect(delta(500, -1000).percent).toBe(150);
  });
});

describe("salesByMedium / topClients", () => {
  const projects = [project("pr1", "Óleo"), project("pr2", "Cerámica")];
  const contacts = [contact("c1", "Marta"), contact("c2", "Luis")];
  const sales = [
    sale("s1", 8000, { projectId: "pr1", contactId: "c1" }),
    sale("s2", 2000, { projectId: "pr2", contactId: "c2" }),
    sale("s3", 3000, { projectId: "pr1", contactId: "c1" })
  ];
  const payments = [
    payment("p1", "s1", 8000, "2026-03-12"),
    payment("p2", "s2", 2000, "2026-03-13"),
    payment("p3", "s3", 1000, "2026-03-14"),
    payment("p4", "s3", 2000, "2026-03-15")
  ];

  it("ranks mediums by collected money with sale counts and shares", () => {
    expect(salesByMedium(sales, payments, projects, Y.from, Y.to)).toEqual([
      { id: "Óleo", label: "Óleo", amount: 11000, share: 11000 / 13000, count: 2 },
      { id: "Cerámica", label: "Cerámica", amount: 2000, share: 2000 / 13000, count: 1 }
    ]);
  });

  it("ranks clients by collected money", () => {
    const rows = topClients(sales, payments, contacts, Y.from, Y.to);
    expect(rows.map((r) => [r.label, r.amount, r.count])).toEqual([
      ["Marta", 11000, 2],
      ["Luis", 2000, 1]
    ]);
  });
});

describe("leadFunnel", () => {
  it("buckets leads created in the period", () => {
    const contacts = [
      contact("l1", "A", { relationship: "lead", leadStage: "won" }),
      contact("l2", "B", { relationship: "lead", leadStage: "lost" }),
      contact("l3", "C", { relationship: "lead", leadStage: "negotiating" }),
      contact("l4", "D", { relationship: "lead", leadStage: "won", createdAt: "2025-12-01" }),
      contact("c9", "E")
    ];
    expect(leadFunnel(contacts, Y.from, Y.to)).toEqual({ open: 1, won: 1, lost: 1, conversion: 50 });
    expect(leadFunnel([], Y.from, Y.to).conversion).toBeNull();
  });
});

describe("avgDaysToCollect", () => {
  it("measures the sale date to the settling payment, settled sales only", () => {
    const sales = [sale("s1", 1000, { date: "2026-03-01" }), sale("s2", 1000, { date: "2026-03-01" })];
    const payments = [
      payment("p1", "s1", 500, "2026-03-05"),
      payment("p2", "s1", 500, "2026-03-21"), // settles on day 20
      payment("p3", "s2", 200, "2026-03-02") // never settles
    ];
    expect(avgDaysToCollect(sales, payments, Y.from, Y.to)).toBe(20);
    expect(avgDaysToCollect([], [], Y.from, Y.to)).toBeNull();
  });
});

describe("bestMonths", () => {
  it("ranks by net, best first", () => {
    const points = [
      { month: "2026-01", net: 100 },
      { month: "2026-02", net: 900 },
      { month: "2026-03", net: -50 },
      { month: "2026-04", net: 900 }
    ];
    expect(bestMonths(points, 2).map((p) => p.month)).toEqual(["2026-02", "2026-04"]);
  });
});
