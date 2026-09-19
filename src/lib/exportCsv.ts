import type { Assignment, Contact, Course, Expense, Installment, Payment, Project, Sale, ScheduleEvent } from "../types";
import { installmentPlan } from "../utils/accounting";
import {
  ASSIGNMENT_STATUS,
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
  const rows: (string | number | null)[][] = [["Fecha", "Monto", "Método", "Ingreso", "Cliente", "Notas"]];
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

/* The committed schedule behind every deposit_balance / installments
   sale. It was the one thing the app showed her and could not hand over:
   "paid" is never stored, it is allocated from the sale's payments in
   due-date order, so an export has to run the same allocation rather
   than read a flag.

   Each state is "as of `to`", the end of the reported period — not as of
   the real today. That is the right accounting semantic for a period
   report (a Q1 export should say what was overdue at the close of Q1)
   and it keeps this function pure and its output reproducible. */
export function installmentsCsv(
  installments: Installment[],
  sales: Sale[],
  payments: Payment[],
  contacts: Contact[],
  from: string,
  to: string
): string {
  const name = new Map(contacts.map((c) => [c.id, c.name]));
  const STATE: Record<string, string> = {
    paid: "Pagada",
    partial: "Parcial",
    pending: "Pendiente",
    overdue: "Vencida"
  };
  const rows: (string | number | null)[][] = [
    ["Vence", "Monto", "Cubierto", "Falta", "Estado", "Ingreso", "Cliente"]
  ];
  const withPlans = sales.filter((s) => installments.some((i) => i.saleId === s.id));
  const steps = withPlans.flatMap((s) =>
    installmentPlan(s.id, installments, payments, to).map((step) => ({ sale: s, step }))
  );
  for (const { sale, step } of steps
    .filter(({ step }) => inRange(step.installment.dueDate, from, to))
    .sort((a, b) => a.step.installment.dueDate.localeCompare(b.step.installment.dueDate))) {
    rows.push([
      step.installment.dueDate,
      step.installment.amount,
      step.covered,
      step.remaining,
      STATE[step.state] ?? step.state,
      sale.title,
      sale.contactId ? (name.get(sale.contactId) ?? "") : ""
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

/** Her tareas due in the period (undated ones ride along when created in it). */
export function assignmentsCsv(assignments: Assignment[], courses: Course[], projects: Project[], from: string, to: string): string {
  const course = new Map(courses.map((c) => [c.id, c.name]));
  const piece = new Map(projects.map((p) => [p.id, p.title]));
  const rows: (string | number | null)[][] = [["Entrega", "Título", "Curso", "Estado", "Entregada el", "Calificación", "Pieza", "Retroalimentación"]];
  const inPeriod = (a: Assignment) => (a.dueDate ? inRange(a.dueDate, from, to) : inRange(a.createdAt, from, to));
  for (const a of [...assignments].filter(inPeriod).sort((x, y) => (x.dueDate ?? x.createdAt).localeCompare(y.dueDate ?? y.createdAt))) {
    rows.push([
      a.dueDate ?? "",
      a.title,
      course.get(a.courseId) ?? "",
      labelFor(ASSIGNMENT_STATUS, a.status),
      a.completedAt ?? "",
      a.grade,
      a.projectId ? (piece.get(a.projectId) ?? "") : "",
      a.feedback
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
