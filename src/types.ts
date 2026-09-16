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
  courseId: string | null; // a piece made for a course she takes
  notes: string;
  createdAt: string; // ISO
}

export type ContactRelationship =
  | "lead"
  | "client"
  | "gallery"
  | "supplier"
  | "collaborator"
  | "teacher"
  | "school"
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
  courseId: string | null; // tuition, materials for a course she takes
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

/* A period of a rule she deleted, so the materializer leaves it alone.
   Deliberately not a flag on the Sale/Expense: every money derivation
   would have to learn to filter it, and the one that got missed would
   report a wrong total in silence. Nothing derives from this — the
   materializer is its only reader. */
export interface MaterializerSkip {
  id: string;
  createdAt: string;
  recurringRuleId: string;
  periodKey: string;
}

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
  groupId: string | null; // tuition rule → its class group (she teaches)
  courseId: string | null; // tuition rule → the course she takes
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
  courseId: string | null; // a session of a course she takes
  missed: boolean; // she didn't make it ("Falté")
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
  groupId: string | null; // a class group's schedule (she teaches)
  courseId: string | null; // a course's schedule (she takes)
  notes: string;
  createdAt: string; // ISO
}

/* ── Estudios ──
   The courses SHE takes. A course owns its schedule (an EventSeries),
   what it costs her (an expense rule or one-off expenses linked by
   courseId), and later tareas, notas and material. */

export type CourseKind = "class" | "workshop" | "master" | "seminar" | "diploma" | "online" | "other";
export type CourseStatus = "upcoming" | "active" | "completed" | "dropped";
export type CourseModality = "in_person" | "online" | "hybrid";
export type CoursePaymentPlan = "single" | "monthly" | "per_session" | "free";

export interface Course {
  id: string;
  name: string;
  kind: CourseKind;
  status: CourseStatus;
  institution: string;
  teacherContactId: string | null;
  modality: CourseModality;
  location: string;
  url: string;
  startDate: string | null; // ISO
  endDate: string | null; // ISO
  seriesId: string | null; // its schedule
  cost: number | null; // total she pays (per month when the plan is monthly)
  paymentPlan: CoursePaymentPlan;
  recurringRuleId: string | null; // the tuition expense rule
  notes: string;
  createdAt: string; // ISO
}

/* A tarea: something a course asks her to hand in. Its description is
   markdown (task lines drive progress); the piece she made for it links
   through projectId. Cascades with the course; survives the piece. */
export type AssignmentStatus = "todo" | "in_progress" | "done";

export interface Assignment {
  id: string;
  courseId: string;
  title: string;
  description: string;
  dueDate: string | null; // ISO
  dueTime: string | null; // HH:MM
  status: AssignmentStatus;
  completedAt: string | null; // ISO date
  projectId: string | null;
  grade: string;
  feedback: string;
  createdAt: string; // ISO
}

/* ── Notas ──
   Her apuntes: markdown, optionally linked to a course, one of its
   sessions, a tarea or a piece. Unlinked notes are the Inbox. Tags
   are per workspace; versions are snapshots the server keeps. */
export interface Note {
  id: string;
  title: string;
  content: string; // markdown
  pinned: boolean;
  courseId: string | null;
  eventId: string | null; // a session of the course
  assignmentId: string | null;
  projectId: string | null;
  coverAttachmentId: string | null; // one of its attachments, shown as a hero
  createdAt: string; // ISO date
  updatedAt: string; // ISO datetime — drives the recency groups
}

export interface NoteTag {
  id: string;
  label: string;
  color: string;
  createdAt: string; // ISO date
}

/* ── Material ──
   Files (bytes in R2 under ws/<workspace>/…) and links, each living
   with a course, a tarea, a piece or a session. Images pasted into a
   note are NoteAttachments and go with the note. */
export type DocumentKind = "file" | "link";

export interface Document {
  id: string;
  kind: DocumentKind;
  name: string;
  r2Path: string | null; // files
  url: string | null; // links
  mime: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  courseId: string | null;
  assignmentId: string | null;
  projectId: string | null;
  eventId: string | null;
  createdAt: string; // ISO date
}

export interface NoteAttachment {
  id: string;
  noteId: string;
  r2Path: string;
  mime: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  createdAt: string; // ISO date
}

export interface NoteTagLink {
  id: string;
  noteId: string;
  tagId: string;
  createdAt: string; // ISO date
}

export interface NoteVersion {
  id: string;
  noteId: string;
  versionNo: number;
  title: string;
  content: string;
  createdAt: string; // ISO datetime
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
  | "studies"
  | "expos"
  | "murals"
  | "illustration"
  | "other";

export type QuickAction = "sale" | "expense" | "event" | "project" | "contact" | "assignment" | "note";
export type ThemePreference = "light" | "dark" | "system";
/* The app opts out of OS text scaling (text-size-adjust: none — see
   the html rule in styles/base.css and the reasoning there), so this is
   the ONLY way she can make the app bigger. It used to stop at 1.1x,
   which is not an accessibility control, it is a nudge. */
export type TextScale = "sm" | "md" | "lg" | "xl" | "xxl";

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
