import { describe, expect, it } from "vitest";
import type { Expense, Payment, Sale } from "../../types";
import { expoReport, expoVerdict } from "../expo";

const fmt = (n: number) => `$${n}`;
const sale = (id: string, amount: number, eventId = "x1"): Sale => ({
  id, title: id, amount, date: "2026-09-01", status: "confirmed", category: "piece", paymentTerms: "single",
  projectId: null, contactId: null, eventId, recurringRuleId: null, periodKey: null, notes: "", createdAt: "2026-09-01"
});
const payment = (id: string, saleId: string, amount: number): Payment => ({
  id, saleId, amount, date: "2026-09-02", method: "cash", notes: "", createdAt: "2026-09-02"
});
const expense = (id: string, amount: number, eventId = "x1"): Expense => ({
  id, title: id, amount, date: "2026-08-20", category: "expo", method: null, projectId: null, eventId,
  recurringRuleId: null, periodKey: null, notes: "", createdAt: "2026-08-20"
});

describe("expoReport", () => {
  it("is green when collected covers the spend", () => {
    const r = expoReport("x1", 5000, [sale("s1", 9000)], [payment("p1", "s1", 9000)], [expense("e1", 4000)], 3000);
    expect(r.signal).toBe("green");
    expect(r.budgetRatio).toBe(0.8);
    expect(r.overBudget).toBe(0);
    expect(r.breakEvenPieces).toBe(2);
    expect(r.piecesToGo).toBe(0);
    expect(expoVerdict(r, fmt)).toBe("Se pagó sola y dejó $5000 en mano.");
  });

  it("is amber when sold but not collected", () => {
    const r = expoReport("x1", null, [sale("s1", 9000)], [payment("p1", "s1", 1000)], [expense("e1", 4000)], 3000);
    expect(r.signal).toBe("amber");
    expect(r.budgetRatio).toBeNull();
    expect(expoVerdict(r, fmt)).toBe("Vendió lo suficiente; faltan $8000 por cobrar para cubrirla.");
  });

  it("is red when it cost more than it sold, with pieces to go and over-budget", () => {
    const r = expoReport("x1", 3000, [sale("s1", 2000)], [], [expense("e1", 4000), expense("e2", 1000)], 2500);
    expect(r.signal).toBe("red");
    expect(r.overBudget).toBe(2000);
    expect(r.breakEvenPieces).toBe(2);
    expect(r.piecesToGo).toBe(2);
    expect(expoVerdict(r, fmt)).toBe("Costó $3000 más de lo que dejó.");
  });

  it("uses the budget as the cost basis before anything is spent, and is none with nothing", () => {
    const r = expoReport("x1", 6000, [], [], [], 2000);
    expect(r.signal).toBe("none");
    expect(r.breakEvenPieces).toBe(3);
    expect(expoReport("x1", null, [], [], [], null).breakEvenPieces).toBeNull();
  });

  it("ignores sales and expenses linked to other events", () => {
    const r = expoReport("x1", null, [sale("s1", 9000, "x2")], [payment("p1", "s1", 9000)], [expense("e1", 100, "x2")], null);
    expect(r.signal).toBe("none");
  });
});
