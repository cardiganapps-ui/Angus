export type ProjectStatus = "idea" | "in_progress" | "on_hold" | "completed";

export interface Project {
  id: string;
  title: string;
  medium: string;
  status: ProjectStatus;
  startDate: string | null; // ISO
  dueDate: string | null; // ISO
  price: number | null;
  contactId: string | null; // client/gallery this project is for
  notes: string;
  createdAt: string; // ISO
}

export type ContactRelationship =
  | "lead"
  | "client"
  | "gallery"
  | "supplier"
  | "collaborator"
  | "other";

export type LeadStage = "new" | "contacted" | "negotiating" | "won" | "lost";

export interface Contact {
  id: string;
  name: string;
  relationship: ContactRelationship;
  email: string;
  phone: string;
  leadStage: LeadStage | null; // set when relationship === "lead"
  followUpDate: string | null; // ISO
  notes: string;
  createdAt: string; // ISO
}

/* ── Money ──
   Amounts are pesos as `number`. All arithmetic goes through
   utils/money.ts (cent-integer math) — never sum these directly. */

export type SaleStatus = "quoted" | "confirmed" | "delivered" | "cancelled";

export interface Sale {
  id: string;
  title: string;
  amount: number; // total agreed price
  date: string; // ISO date the sale was agreed
  status: SaleStatus;
  projectId: string | null;
  contactId: string | null; // the buyer
  notes: string;
  createdAt: string; // ISO
}

export type PaymentMethod = "cash" | "transfer" | "card" | "other";

/** Money actually received against a sale. The source of truth for "paid". */
export interface Payment {
  id: string;
  saleId: string;
  amount: number;
  date: string; // ISO
  method: PaymentMethod;
  notes: string;
  createdAt: string; // ISO
}

/** One scheduled step of a payment plan — an expectation, not money received. */
export interface Installment {
  id: string;
  saleId: string;
  amount: number;
  dueDate: string; // ISO
  notes: string;
  createdAt: string; // ISO
}

export type ExpenseCategory =
  | "materials"
  | "studio"
  | "equipment"
  | "transport"
  | "courses"
  | "expo"
  | "fees"
  | "other";

export interface Expense {
  id: string;
  title: string;
  amount: number;
  date: string; // ISO
  category: ExpenseCategory;
  projectId: string | null;
  eventId: string | null; // ties spend to an expo / class
  notes: string;
  createdAt: string; // ISO
}

export type EventKind =
  | "class"
  | "expo"
  | "meeting"
  | "deadline"
  | "personal"
  | "other";

export interface ScheduleEvent {
  id: string;
  title: string;
  kind: EventKind;
  date: string; // ISO date, YYYY-MM-DD
  startTime: string | null; // HH:MM
  endTime: string | null; // HH:MM
  location: string;
  projectId: string | null;
  contactId: string | null;
  notes: string;
  createdAt: string; // ISO
}
