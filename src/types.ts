export type ProjectStatus = "idea" | "in_progress" | "on_hold" | "completed";

/** Whether the piece can be sold — inventory state, separate from production status. */
export type Availability = "available" | "reserved" | "sold" | "not_for_sale" | "gifted";

export interface Project {
  id: string;
  title: string;
  medium: string;
  status: ProjectStatus;
  availability: Availability;
  startDate: string | null; // ISO
  dueDate: string | null; // ISO
  price: number | null;
  cost: number | null; // materials estimate; linked expenses win when present
  dimensions: string; // "60 × 80 cm"
  year: number | null;
  edition: string; // "3/10", "única"
  location: string; // where the piece physically is
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

/** What kind of income a sale is — for summaries, not for accounting. */
export type IncomeCategory =
  | "piece"
  | "commission"
  | "class"
  | "workshop"
  | "service"
  | "license"
  | "grant"
  | "other";

/** How she agreed to be paid. The installments table is the plan itself. */
export type PaymentTerms = "single" | "deposit_balance" | "installments";

export interface Sale {
  id: string;
  title: string;
  amount: number; // total agreed price
  date: string; // ISO date the sale was agreed
  status: SaleStatus;
  category: IncomeCategory;
  paymentTerms: PaymentTerms;
  projectId: string | null;
  contactId: string | null; // the buyer
  eventId: string | null; // the expo it sold at, if any
  recurringRuleId: string | null; // set when a recurring rule generated it
  periodKey: string | null; // e.g. "2026-09" — unique per rule
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
  | "framing"
  | "shipping"
  | "marketing"
  | "software"
  | "rent"
  | "services"
  | "taxes"
  | "food"
  | "other";

export interface Expense {
  id: string;
  title: string;
  amount: number;
  date: string; // ISO
  category: ExpenseCategory;
  method: PaymentMethod | null;
  projectId: string | null;
  eventId: string | null; // ties spend to an expo / class
  recurringRuleId: string | null;
  periodKey: string | null;
  notes: string;
  createdAt: string; // ISO
}

/* ── Recurring rules ──
   "Every month, rent 6,500" / "Every month, Sofía's tuition 1,800". A
   rule is an intention; utils/materialize.ts turns each due period into
   a real Sale (income) or Expense row, exactly once per period. */

export type RecurrenceKind = "income" | "expense";
export type RecurrenceCadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

export interface RecurringRule {
  id: string;
  kind: RecurrenceKind;
  title: string;
  amount: number;
  category: string; // IncomeCategory when kind = income, ExpenseCategory otherwise
  cadence: RecurrenceCadence;
  interval: number; // every N cadences, 1–12
  startDate: string; // ISO — first occurrence
  endDate: string | null; // ISO — last possible occurrence
  contactId: string | null; // who pays (income) or who is paid (expense)
  projectId: string | null;
  groupId: string | null; // tuition rule → its class group
  active: boolean;
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
  budget: number | null; // expos: what she planned to spend
  seriesId: string | null; // set when generated by an EventSeries
  cancelled: boolean; // a series slot she removed — kept so it doesn't come back
  detached: boolean; // edited on its own — regeneration leaves it alone
  notes: string;
  createdAt: string; // ISO
}

/* ── Recurring sessions ──
   The rule behind a weekly class or a monthly meeting. Occurrences are
   real ScheduleEvent rows (seriesId + date unique), generated a few
   weeks ahead by utils/series.ts. */

export type SeriesCadence = "weekly" | "biweekly" | "monthly";

export interface EventSeries {
  id: string;
  title: string;
  kind: EventKind;
  cadence: SeriesCadence;
  weekdays: number[]; // 0 = domingo … 6 = sábado (weekly / biweekly); [] = startDate's weekday
  startTime: string | null;
  endTime: string | null;
  location: string;
  startDate: string; // ISO — first possible occurrence
  endDate: string | null; // ISO — last possible occurrence
  projectId: string | null;
  contactId: string | null;
  groupId: string | null; // a class group's schedule
  notes: string;
  createdAt: string; // ISO
}

/* ── Clases ──
   A group she teaches (schedule = an EventSeries), the students
   enrolled in it (contacts), one attendance row per student per
   session, and a tuition rule per enrollment feeding recurring income. */

export type TuitionCadence = "monthly" | "per_session";
export type AttendanceStatus = "present" | "absent" | "excused";

export interface ClassGroup {
  id: string;
  name: string;
  seriesId: string | null;
  tuitionAmount: number | null; // per student
  tuitionCadence: TuitionCadence;
  capacity: number | null;
  location: string;
  active: boolean;
  notes: string;
  createdAt: string; // ISO
}

export interface ClassEnrollment {
  id: string;
  groupId: string;
  contactId: string;
  startedOn: string; // ISO
  endedOn: string | null; // ISO
  recurringRuleId: string | null; // the student's tuition rule
  notes: string;
  createdAt: string; // ISO
}

export interface Attendance {
  id: string;
  eventId: string;
  contactId: string;
  status: AttendanceStatus;
  createdAt: string; // ISO
}

/* ── Workspace settings ──
   Per-studio preferences stored as jsonb on `workspaces.settings`.
   Always read through utils/settings.ts → mergeSettings(), which fills
   defaults and drops anything it doesn't recognize. */

export type Practice =
  | "pieces"
  | "commissions"
  | "classes"
  | "workshops"
  | "expos"
  | "murals"
  | "illustration"
  | "other";

export type QuickAction = "sale" | "expense" | "event" | "project" | "contact";
export type ThemePreference = "light" | "dark" | "system";
export type TextScale = "sm" | "md" | "lg";

export interface WorkspaceSettings {
  artistName: string; // "Andrea" → "Buenos días, Andrea"
  practice: Practice[]; // what she does; gates dashboard sections
  mediums: string[]; // free-text chips, suggested from her pieces
  monthlyIncomeGoal: number | null; // MXN collected per month she aims for
  defaultPaymentMethod: PaymentMethod;
  defaultDepositPercent: number; // 1–99, the anticipo she usually asks for
  defaultInstallmentFrequency: "monthly" | "biweekly";
  budgets: Partial<Record<ExpenseCategory, number>>; // monthly limits
  theme: ThemePreference;
  textScale: TextScale;
  quickActions: QuickAction[]; // FAB speed-dial order on Hoy
}

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  settings: WorkspaceSettings;
  onboardedAt: string | null; // ISO timestamp
}
