import type {
  Contact,
  EventSeries,
  Expense,
  Installment,
  Payment,
  Project,
  RecurringRule,
  Sale,
  ScheduleEvent
} from "../types";
import type { CloudStoreConfig } from "../hooks/useCloudStore";

export interface ProjectRow {
  id: string;
  title: string;
  medium: string;
  status: Project["status"];
  start_date: string | null;
  due_date: string | null;
  price: number | string | null;
  contact_id: string | null;
  notes: string;
  created_at: string;
}

export interface ContactRow {
  id: string;
  name: string;
  relationship: Contact["relationship"];
  email: string;
  phone: string;
  lead_stage: Contact["leadStage"];
  follow_up_date: string | null;
  notes: string;
  created_at: string;
}

export interface EventRow {
  id: string;
  title: string;
  kind: ScheduleEvent["kind"];
  date: string;
  start_time: string | null;
  end_time: string | null;
  location: string;
  project_id: string | null;
  contact_id: string | null;
  series_id: string | null;
  cancelled: boolean;
  detached: boolean;
  notes: string;
  created_at: string;
}

export interface EventSeriesRow {
  id: string;
  title: string;
  kind: EventSeries["kind"];
  cadence: EventSeries["cadence"];
  weekdays: number[];
  start_time: string | null;
  end_time: string | null;
  location: string;
  start_date: string;
  end_date: string | null;
  project_id: string | null;
  contact_id: string | null;
  notes: string;
  created_at: string;
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

export const projectStore: CloudStoreConfig<Project, ProjectRow> = {
  table: "projects",
  fromRow: (r) => ({
    id: r.id,
    title: r.title,
    medium: r.medium,
    status: r.status,
    startDate: r.start_date,
    dueDate: r.due_date,
    price: r.price === null ? null : Number(r.price),
    contactId: r.contact_id,
    notes: r.notes,
    createdAt: r.created_at.slice(0, 10)
  }),
  toRow: (p) => {
    const row: Partial<ProjectRow> = {};
    if (p.id !== undefined) row.id = p.id;
    if (p.title !== undefined) row.title = p.title;
    if (p.medium !== undefined) row.medium = p.medium;
    if (p.status !== undefined) row.status = p.status;
    if (p.startDate !== undefined) row.start_date = p.startDate;
    if (p.dueDate !== undefined) row.due_date = p.dueDate;
    if (p.price !== undefined) row.price = p.price;
    if (p.contactId !== undefined) row.contact_id = p.contactId;
    if (p.notes !== undefined) row.notes = p.notes;
    return row;
  }
};

export const contactStore: CloudStoreConfig<Contact, ContactRow> = {
  table: "contacts",
  fromRow: (r) => ({
    id: r.id,
    name: r.name,
    relationship: r.relationship,
    email: r.email,
    phone: r.phone,
    leadStage: r.lead_stage,
    followUpDate: r.follow_up_date,
    notes: r.notes,
    createdAt: r.created_at.slice(0, 10)
  }),
  toRow: (c) => {
    const row: Partial<ContactRow> = {};
    if (c.id !== undefined) row.id = c.id;
    if (c.name !== undefined) row.name = c.name;
    if (c.relationship !== undefined) row.relationship = c.relationship;
    if (c.email !== undefined) row.email = c.email;
    if (c.phone !== undefined) row.phone = c.phone;
    if (c.leadStage !== undefined) row.lead_stage = c.leadStage;
    if (c.followUpDate !== undefined) row.follow_up_date = c.followUpDate;
    if (c.notes !== undefined) row.notes = c.notes;
    return row;
  }
};

export const eventStore: CloudStoreConfig<ScheduleEvent, EventRow> = {
  table: "events",
  fromRow: (r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    date: r.date,
    startTime: hhmm(r.start_time),
    endTime: hhmm(r.end_time),
    location: r.location,
    projectId: r.project_id,
    contactId: r.contact_id,
    seriesId: r.series_id,
    cancelled: r.cancelled,
    detached: r.detached,
    notes: r.notes,
    createdAt: r.created_at.slice(0, 10)
  }),
  toRow: (e) => {
    const row: Partial<EventRow> = {};
    if (e.id !== undefined) row.id = e.id;
    if (e.title !== undefined) row.title = e.title;
    if (e.kind !== undefined) row.kind = e.kind;
    if (e.date !== undefined) row.date = e.date;
    if (e.startTime !== undefined) row.start_time = e.startTime;
    if (e.endTime !== undefined) row.end_time = e.endTime;
    if (e.location !== undefined) row.location = e.location;
    if (e.projectId !== undefined) row.project_id = e.projectId;
    if (e.contactId !== undefined) row.contact_id = e.contactId;
    if (e.seriesId !== undefined) row.series_id = e.seriesId;
    if (e.cancelled !== undefined) row.cancelled = e.cancelled;
    if (e.detached !== undefined) row.detached = e.detached;
    if (e.notes !== undefined) row.notes = e.notes;
    return row;
  }
};

export const eventSeriesStore: CloudStoreConfig<EventSeries, EventSeriesRow> = {
  table: "event_series",
  fromRow: (r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    cadence: r.cadence,
    weekdays: [...(r.weekdays ?? [])].map(Number),
    startTime: hhmm(r.start_time),
    endTime: hhmm(r.end_time),
    location: r.location,
    startDate: r.start_date,
    endDate: r.end_date,
    projectId: r.project_id,
    contactId: r.contact_id,
    notes: r.notes,
    createdAt: r.created_at.slice(0, 10)
  }),
  toRow: (x) => {
    const row: Partial<EventSeriesRow> = {};
    if (x.id !== undefined) row.id = x.id;
    if (x.title !== undefined) row.title = x.title;
    if (x.kind !== undefined) row.kind = x.kind;
    if (x.cadence !== undefined) row.cadence = x.cadence;
    if (x.weekdays !== undefined) row.weekdays = x.weekdays;
    if (x.startTime !== undefined) row.start_time = x.startTime;
    if (x.endTime !== undefined) row.end_time = x.endTime;
    if (x.location !== undefined) row.location = x.location;
    if (x.startDate !== undefined) row.start_date = x.startDate;
    if (x.endDate !== undefined) row.end_date = x.endDate;
    if (x.projectId !== undefined) row.project_id = x.projectId;
    if (x.contactId !== undefined) row.contact_id = x.contactId;
    if (x.notes !== undefined) row.notes = x.notes;
    return row;
  }
};

/* ── Money ──
   PostgREST returns `numeric` as a string, so every amount goes through
   Number() on the way in. */

export interface SaleRow {
  id: string;
  title: string;
  amount: number | string;
  date: string;
  status: Sale["status"];
  category: Sale["category"];
  payment_terms: Sale["paymentTerms"];
  project_id: string | null;
  contact_id: string | null;
  event_id: string | null;
  recurring_rule_id: string | null;
  period_key: string | null;
  notes: string;
  created_at: string;
}

export interface PaymentRow {
  id: string;
  sale_id: string;
  amount: number | string;
  date: string;
  method: Payment["method"];
  notes: string;
  created_at: string;
}

export interface InstallmentRow {
  id: string;
  sale_id: string;
  amount: number | string;
  due_date: string;
  notes: string;
  created_at: string;
}

export interface ExpenseRow {
  id: string;
  title: string;
  amount: number | string;
  date: string;
  category: Expense["category"];
  method: Expense["method"];
  project_id: string | null;
  event_id: string | null;
  recurring_rule_id: string | null;
  period_key: string | null;
  notes: string;
  created_at: string;
}

export interface RecurringRuleRow {
  id: string;
  kind: RecurringRule["kind"];
  title: string;
  amount: number | string;
  category: string;
  cadence: RecurringRule["cadence"];
  interval: number;
  start_date: string;
  end_date: string | null;
  contact_id: string | null;
  project_id: string | null;
  active: boolean;
  notes: string;
  created_at: string;
}

export const saleStore: CloudStoreConfig<Sale, SaleRow> = {
  table: "sales",
  fromRow: (r) => ({
    id: r.id,
    title: r.title,
    amount: Number(r.amount),
    date: r.date,
    status: r.status,
    category: r.category,
    paymentTerms: r.payment_terms,
    projectId: r.project_id,
    contactId: r.contact_id,
    eventId: r.event_id,
    recurringRuleId: r.recurring_rule_id,
    periodKey: r.period_key,
    notes: r.notes,
    createdAt: r.created_at.slice(0, 10)
  }),
  toRow: (s) => {
    const row: Partial<SaleRow> = {};
    if (s.id !== undefined) row.id = s.id;
    if (s.title !== undefined) row.title = s.title;
    if (s.amount !== undefined) row.amount = s.amount;
    if (s.date !== undefined) row.date = s.date;
    if (s.status !== undefined) row.status = s.status;
    if (s.category !== undefined) row.category = s.category;
    if (s.paymentTerms !== undefined) row.payment_terms = s.paymentTerms;
    if (s.projectId !== undefined) row.project_id = s.projectId;
    if (s.contactId !== undefined) row.contact_id = s.contactId;
    if (s.eventId !== undefined) row.event_id = s.eventId;
    if (s.recurringRuleId !== undefined) row.recurring_rule_id = s.recurringRuleId;
    if (s.periodKey !== undefined) row.period_key = s.periodKey;
    if (s.notes !== undefined) row.notes = s.notes;
    return row;
  }
};

export const paymentStore: CloudStoreConfig<Payment, PaymentRow> = {
  table: "payments",
  fromRow: (r) => ({
    id: r.id,
    saleId: r.sale_id,
    amount: Number(r.amount),
    date: r.date,
    method: r.method,
    notes: r.notes,
    createdAt: r.created_at.slice(0, 10)
  }),
  toRow: (p) => {
    const row: Partial<PaymentRow> = {};
    if (p.id !== undefined) row.id = p.id;
    if (p.saleId !== undefined) row.sale_id = p.saleId;
    if (p.amount !== undefined) row.amount = p.amount;
    if (p.date !== undefined) row.date = p.date;
    if (p.method !== undefined) row.method = p.method;
    if (p.notes !== undefined) row.notes = p.notes;
    return row;
  }
};

export const installmentStore: CloudStoreConfig<Installment, InstallmentRow> = {
  table: "installments",
  fromRow: (r) => ({
    id: r.id,
    saleId: r.sale_id,
    amount: Number(r.amount),
    dueDate: r.due_date,
    notes: r.notes,
    createdAt: r.created_at.slice(0, 10)
  }),
  toRow: (i) => {
    const row: Partial<InstallmentRow> = {};
    if (i.id !== undefined) row.id = i.id;
    if (i.saleId !== undefined) row.sale_id = i.saleId;
    if (i.amount !== undefined) row.amount = i.amount;
    if (i.dueDate !== undefined) row.due_date = i.dueDate;
    if (i.notes !== undefined) row.notes = i.notes;
    return row;
  }
};

export const expenseStore: CloudStoreConfig<Expense, ExpenseRow> = {
  table: "expenses",
  fromRow: (r) => ({
    id: r.id,
    title: r.title,
    amount: Number(r.amount),
    date: r.date,
    category: r.category,
    method: r.method,
    projectId: r.project_id,
    eventId: r.event_id,
    recurringRuleId: r.recurring_rule_id,
    periodKey: r.period_key,
    notes: r.notes,
    createdAt: r.created_at.slice(0, 10)
  }),
  toRow: (e) => {
    const row: Partial<ExpenseRow> = {};
    if (e.id !== undefined) row.id = e.id;
    if (e.title !== undefined) row.title = e.title;
    if (e.amount !== undefined) row.amount = e.amount;
    if (e.date !== undefined) row.date = e.date;
    if (e.category !== undefined) row.category = e.category;
    if (e.method !== undefined) row.method = e.method;
    if (e.projectId !== undefined) row.project_id = e.projectId;
    if (e.eventId !== undefined) row.event_id = e.eventId;
    if (e.recurringRuleId !== undefined) row.recurring_rule_id = e.recurringRuleId;
    if (e.periodKey !== undefined) row.period_key = e.periodKey;
    if (e.notes !== undefined) row.notes = e.notes;
    return row;
  }
};

export const recurringRuleStore: CloudStoreConfig<RecurringRule, RecurringRuleRow> = {
  table: "recurring_rules",
  fromRow: (r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    amount: Number(r.amount),
    category: r.category,
    cadence: r.cadence,
    interval: Number(r.interval),
    startDate: r.start_date,
    endDate: r.end_date,
    contactId: r.contact_id,
    projectId: r.project_id,
    active: r.active,
    notes: r.notes,
    createdAt: r.created_at.slice(0, 10)
  }),
  toRow: (x) => {
    const row: Partial<RecurringRuleRow> = {};
    if (x.id !== undefined) row.id = x.id;
    if (x.kind !== undefined) row.kind = x.kind;
    if (x.title !== undefined) row.title = x.title;
    if (x.amount !== undefined) row.amount = x.amount;
    if (x.category !== undefined) row.category = x.category;
    if (x.cadence !== undefined) row.cadence = x.cadence;
    if (x.interval !== undefined) row.interval = x.interval;
    if (x.startDate !== undefined) row.start_date = x.startDate;
    if (x.endDate !== undefined) row.end_date = x.endDate;
    if (x.contactId !== undefined) row.contact_id = x.contactId;
    if (x.projectId !== undefined) row.project_id = x.projectId;
    if (x.active !== undefined) row.active = x.active;
    if (x.notes !== undefined) row.notes = x.notes;
    return row;
  }
};
