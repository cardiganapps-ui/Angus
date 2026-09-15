import type { Contact, Expense, Payment, Project, Sale, ScheduleEvent } from "../types";
import {
  EXPENSE_CATEGORY,
  INCOME_CATEGORY,
  PAYMENT_METHOD,
  PAYMENT_TERMS,
  SALE_STATUS,
  labelFor
} from "../data/constants";

/* ── CSV export ──
   For her accountant, or a spreadsheet. UTF-8 with a BOM so Excel on
   Windows reads the accents; comma separated, every field quoted. */

export function toCsv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

const inRange = (d: string, from: string, to: string) => d >= from && d <= to;

export function salesCsv(
  sales: Sale[],
  payments: Payment[],
  contacts: Contact[],
  projects: Project[],
  from: string,
  to: string
): string {
  const name = new Map(contacts.map((c) => [c.id, c.name]));
  const piece = new Map(projects.map((p) => [p.id, p.title]));
  const paid = new Map<string, number>();
  for (const p of payments) paid.set(p.saleId, (paid.get(p.saleId) ?? 0) + p.amount);
  const rows: (string | number | null)[][] = [
    ["Fecha", "Título", "Monto", "Pagado", "Estado", "Tipo", "Forma de pago", "Cliente", "Pieza", "Notas"]
  ];
  for (const s of [...sales].filter((s) => inRange(s.date, from, to)).sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([
      s.date,
      s.title,
      s.amount,
      Math.round((paid.get(s.id) ?? 0) * 100) / 100,
      labelFor(SALE_STATUS, s.status),
      labelFor(INCOME_CATEGORY, s.category),
      labelFor(PAYMENT_TERMS, s.paymentTerms),
      s.contactId ? (name.get(s.contactId) ?? "") : "",
      s.projectId ? (piece.get(s.projectId) ?? "") : "",
      s.notes
    ]);
  }
  return toCsv(rows);
}

export function paymentsCsv(payments: Payment[], sales: Sale[], contacts: Contact[], from: string, to: string): string {
  const sale = new Map(sales.map((s) => [s.id, s]));
  const name = new Map(contacts.map((c) => [c.id, c.name]));
  const rows: (string | number | null)[][] = [["Fecha", "Monto", "Método", "Venta", "Cliente", "Notas"]];
  for (const p of [...payments].filter((p) => inRange(p.date, from, to)).sort((a, b) => a.date.localeCompare(b.date))) {
    const s = sale.get(p.saleId);
    rows.push([
      p.date,
      p.amount,
      labelFor(PAYMENT_METHOD, p.method),
      s?.title ?? "",
      s?.contactId ? (name.get(s.contactId) ?? "") : "",
      p.notes
    ]);
  }
  return toCsv(rows);
}

export function expensesCsv(
  expenses: Expense[],
  projects: Project[],
  events: ScheduleEvent[],
  from: string,
  to: string
): string {
  const piece = new Map(projects.map((p) => [p.id, p.title]));
  const event = new Map(events.map((e) => [e.id, e.title]));
  const rows: (string | number | null)[][] = [["Fecha", "Título", "Monto", "Categoría", "Método", "Pieza", "Expo", "Fijo", "Notas"]];
  for (const e of [...expenses].filter((e) => inRange(e.date, from, to)).sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([
      e.date,
      e.title,
      e.amount,
      labelFor(EXPENSE_CATEGORY, e.category),
      e.method ? labelFor(PAYMENT_METHOD, e.method) : "",
      e.projectId ? (piece.get(e.projectId) ?? "") : "",
      e.eventId ? (event.get(e.eventId) ?? "") : "",
      e.recurringRuleId ? "Sí" : "",
      e.notes
    ]);
  }
  return toCsv(rows);
}

/** Trigger a download in the browser. Returns false if the environment can't. */
export function downloadCsv(filename: string, csv: string): boolean {
  if (typeof document === "undefined" || typeof URL === "undefined") return false;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
