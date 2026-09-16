import { describe, expect, it } from "vitest";
import type { Assignment, Expense, Installment, Payment, Sale } from "../../types";
import { assignmentsCsv, expensesCsv, installmentsCsv, paymentsCsv, salesCsv, toCsv } from "../../lib/exportCsv";

describe("toCsv", () => {
  it("quotes every field, escapes quotes, prefixes a BOM and uses CRLF", () => {
    const csv = toCsv([
      ["a", "b"],
      ['say "hi"', 12.5],
      [null, "x,y"]
    ]);
    expect(csv).toBe('﻿"a","b"\r\n"say ""hi""","12.5"\r\n"","x,y"\r\n');
  });
});

describe("salesCsv / expensesCsv", () => {
  const sale: Sale = {
    id: "s1", title: "Retrato", amount: 5000, date: "2026-03-10", status: "confirmed", category: "commission",
    paymentTerms: "deposit_balance", projectId: "p1", contactId: "c1", eventId: null, recurringRuleId: null,
    periodKey: null, notes: "", createdAt: "2026-03-10"
  };
  const payment: Payment = { id: "pm1", saleId: "s1", amount: 2500, date: "2026-03-11", method: "cash", notes: "", createdAt: "2026-03-11" };
  const expense: Expense = {
    id: "e1", title: "Bastidor", amount: 300.5, date: "2026-03-01", category: "materials", method: "card",
    projectId: "p1", eventId: null, courseId: null, recurringRuleId: "r1", periodKey: "2026-03-01", notes: "n", createdAt: "2026-03-01"
  };

  it("renders labels, links and paid totals", () => {
    const csv = salesCsv([sale], [payment], [{ id: "c1", name: "Marta" } as never], [{ id: "p1", title: "Pieza A" } as never], "2026-01-01", "2026-12-31");
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain('"Fecha","Título","Monto","Pagado"');
    expect(lines[1]).toBe('"2026-03-10","Retrato","5000","2500","Confirmada","Encargo","Anticipo + liquidación","Marta","Pieza A",""');
  });

  it("filters by range and marks recurring expenses", () => {
    const csv = expensesCsv([expense], [{ id: "p1", title: "Pieza A" } as never], [], "2026-03-01", "2026-03-31");
    expect(csv.split("\r\n")[1]).toBe('"2026-03-01","Bastidor","300.5","Materiales","Tarjeta","Pieza A","","Sí","n"');
    expect(expensesCsv([expense], [], [], "2026-04-01", "2026-04-30").split("\r\n")).toHaveLength(2);
  });
});

describe("assignmentsCsv", () => {
  const base: Assignment = {
    id: "a1", courseId: "k1", title: "Boceto final", description: "", dueDate: "2026-03-20", dueTime: null,
    status: "done", completedAt: "2026-03-19", projectId: "p1", grade: "9", feedback: "Bien resuelto", createdAt: "2026-03-01"
  };
  const courses = [{ id: "k1", name: "Maestría" } as never];
  const pieces = [{ id: "p1", title: "Pieza A" } as never];

  it("renders course, status label, piece and grade in due-date order", () => {
    const later: Assignment = { ...base, id: "a2", title: "Ensayo", dueDate: "2026-03-25", status: "todo", completedAt: null, projectId: null, grade: "", feedback: "" };
    const lines = assignmentsCsv([later, base], courses, pieces, "2026-03-01", "2026-03-31").split("\r\n");
    expect(lines[0]).toContain('"Entrega","Título","Curso","Estado"');
    expect(lines[1]).toBe('"2026-03-20","Boceto final","Maestría","Entregada","2026-03-19","9","Pieza A","Bien resuelto"');
    expect(lines[2]).toBe('"2026-03-25","Ensayo","Maestría","Pendiente","","","",""');
  });

  it("falls back to the creation date when there is no due date, and filters by range", () => {
    const undated: Assignment = { ...base, id: "a3", dueDate: null, createdAt: "2026-04-02" };
    expect(assignmentsCsv([undated], courses, pieces, "2026-04-01", "2026-04-30").split("\r\n")).toHaveLength(3);
    expect(assignmentsCsv([undated, base], courses, pieces, "2026-05-01", "2026-05-31").split("\r\n")).toHaveLength(2);
  });
});

describe("paymentsCsv", () => {
  const sale: Sale = {
    id: "s1", title: "Retrato", amount: 5000, date: "2026-03-10", status: "confirmed", category: "commission",
    paymentTerms: "single", projectId: null, contactId: "c1", eventId: null, recurringRuleId: null,
    periodKey: null, notes: "", createdAt: "2026-03-10"
  };
  const contacts = [{ id: "c1", name: "Marta" } as never];

  it("resolves the sale and its client, oldest first", () => {
    const early: Payment = { id: "pm1", saleId: "s1", amount: 2500, date: "2026-03-11", method: "cash", notes: "anticipo", createdAt: "2026-03-11" };
    const late: Payment = { id: "pm2", saleId: "s1", amount: 2500, date: "2026-04-02", method: "transfer", notes: "", createdAt: "2026-04-02" };
    const lines = paymentsCsv([late, early], [sale], contacts, "2026-01-01", "2026-12-31").split("\r\n");
    expect(lines[0]).toContain('"Fecha","Monto","Método","Venta","Cliente","Notas"');
    expect(lines[1]).toBe('"2026-03-11","2500","Efectivo","Retrato","Marta","anticipo"');
    expect(lines[2]).toBe('"2026-04-02","2500","Transferencia","Retrato","Marta",""');
  });

  it("leaves the sale columns blank for an orphaned payment rather than dropping it", () => {
    const orphan: Payment = { id: "pm3", saleId: "gone", amount: 100, date: "2026-03-15", method: "other", notes: "", createdAt: "2026-03-15" };
    const lines = paymentsCsv([orphan], [sale], contacts, "2026-01-01", "2026-12-31").split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"2026-03-15","100"');
  });

  it("filters by range", () => {
    const p: Payment = { id: "pm4", saleId: "s1", amount: 10, date: "2026-07-01", method: "cash", notes: "", createdAt: "2026-07-01" };
    expect(paymentsCsv([p], [sale], contacts, "2026-01-01", "2026-06-30").split("\r\n")).toHaveLength(2);
  });
});

describe("installmentsCsv", () => {
  const sale: Sale = {
    id: "s1", title: "Mural", amount: 9000, date: "2026-01-10", status: "confirmed", category: "commission",
    paymentTerms: "installments", projectId: null, contactId: "c1", eventId: null, recurringRuleId: null,
    periodKey: null, notes: "", createdAt: "2026-01-10"
  };
  const contacts = [{ id: "c1", name: "Marta" } as never];
  const plan: Installment[] = [
    { id: "i1", saleId: "s1", amount: 3000, dueDate: "2026-02-01", notes: "", createdAt: "2026-01-10" },
    { id: "i2", saleId: "s1", amount: 3000, dueDate: "2026-03-01", notes: "", createdAt: "2026-01-10" },
    { id: "i3", saleId: "s1", amount: 3000, dueDate: "2026-04-01", notes: "", createdAt: "2026-01-10" }
  ];

  /* "Paid" is never stored — it is allocated from the sale's payments in
     due-date order — so the export has to run the same allocation. */
  it("allocates payments across the plan in due-date order", () => {
    const paid: Payment[] = [
      { id: "pm1", saleId: "s1", amount: 4500, date: "2026-02-01", method: "cash", notes: "", createdAt: "2026-02-01" }
    ];
    const lines = installmentsCsv(plan, [sale], paid, contacts, "2026-01-01", "2026-12-31").split("\r\n");
    expect(lines[0]).toContain('"Vence","Monto","Cubierto","Falta","Estado","Venta","Cliente"');
    // 4500 fills the first cuota and half the second; the third is untouched.
    // States are as of `to`, so all three are past due by the period close.
    expect(lines[1]).toBe('"2026-02-01","3000","3000","0","Pagada","Mural","Marta"');
    expect(lines[2]).toBe('"2026-03-01","3000","1500","1500","Vencida","Mural","Marta"');
    expect(lines[3]).toBe('"2026-04-01","3000","0","3000","Vencida","Mural","Marta"');
  });

  it("reports state as of the period end, not the real clock", () => {
    // Same plan, a period closing before the 2nd cuota falls due.
    const lines = installmentsCsv(plan, [sale], [], contacts, "2026-01-01", "2026-02-15").split("\r\n");
    expect(lines[1]).toContain('"Vencida"');
    expect(lines).toHaveLength(3);
  });

  it("is empty but well-formed for a sale with no plan", () => {
    const lines = installmentsCsv([], [sale], [], contacts, "2026-01-01", "2026-12-31").split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('"Vence"');
  });

  it("filters by due date", () => {
    expect(installmentsCsv(plan, [sale], [], contacts, "2026-03-01", "2026-03-31").split("\r\n")).toHaveLength(3);
  });
});
