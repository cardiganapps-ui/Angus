import type {
  Assignment,
  Attendance,
  ClassEnrollment,
  Document,
  Note,
  NoteAttachment,
  NoteTag,
  NoteTagLink,
  ClassGroup,
  Contact,
  Course,
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
  availability: Project["availability"];
  start_date: string | null;
  due_date: string | null;
  price: number | string | null;
  cost: number | string | null;
  dimensions: string;
  year: number | null;
  edition: string;
  location: string;
  contact_id: string | null;
  course_id: string | null;
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
  budget: number | string | null;
  course_id: string | null;
  missed: boolean;
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
  group_id: string | null;
  course_id: string | null;
  notes: string;
  created_at: string;
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

export const projectStore: CloudStoreConfig<Project, ProjectRow> = {
  table: "projects",
  cap: 2_000,
  fromRow: (r) => ({
    id: r.id,
    title: r.title,
    medium: r.medium,
    status: r.status,
    availability: r.availability,
    startDate: r.start_date,
    dueDate: r.due_date,
    price: r.price === null ? null : Number(r.price),
    cost: r.cost === null ? null : Number(r.cost),
    dimensions: r.dimensions,
    year: r.year,
    edition: r.edition,
    location: r.location,
    contactId: r.contact_id,
    courseId: r.course_id,
    notes: r.notes,
    createdAt: r.created_at.slice(0, 10)
  }),
  toRow: (p) => {
    const row: Partial<ProjectRow> = {};
    if (p.id !== undefined) row.id = p.id;
    if (p.title !== undefined) row.title = p.title;
    if (p.medium !== undefined) row.medium = p.medium;
    if (p.status !== undefined) row.status = p.status;
    if (p.availability !== undefined) row.availability = p.availability;
    if (p.startDate !== undefined) row.start_date = p.startDate;
    if (p.dueDate !== undefined) row.due_date = p.dueDate;
    if (p.price !== undefined) row.price = p.price;
    if (p.cost !== undefined) row.cost = p.cost;
    if (p.dimensions !== undefined) row.dimensions = p.dimensions;
    if (p.year !== undefined) row.year = p.year;
    if (p.edition !== undefined) row.edition = p.edition;
    if (p.location !== undefined) row.location = p.location;
    if (p.contactId !== undefined) row.contact_id = p.contactId;
    if (p.courseId !== undefined) row.course_id = p.courseId;
    if (p.notes !== undefined) row.notes = p.notes;
    return row;
  }
};

export const contactStore: CloudStoreConfig<Contact, ContactRow> = {
  table: "contacts",
  cap: 2_000,
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

/* The only date-window candidate, and not enabled yet. Its generator
   (utils/series.ts) diffs forward only, from max(series.startDate, today),
   so forward coverage past SERIES_HORIZON_DAYS is enough — unlike the
   money tables, whose diff reaches back to each rule's own startDate.
   Turning `window` on requires Schedule / Reports / Forecast to declare
   their range via ensureDateRange first, or paging past the edge renders
   a confidently-empty month. */
export const eventStore: CloudStoreConfig<ScheduleEvent, EventRow> = {
  table: "events",
  cap: 20_000,
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
    budget: r.budget === null || r.budget === undefined ? null : Number(r.budget),
    courseId: r.course_id,
    missed: r.missed,
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
    if (e.budget !== undefined) row.budget = e.budget;
    if (e.courseId !== undefined) row.course_id = e.courseId;
    if (e.missed !== undefined) row.missed = e.missed;
    if (e.seriesId !== undefined) row.series_id = e.seriesId;
    if (e.cancelled !== undefined) row.cancelled = e.cancelled;
    if (e.detached !== undefined) row.detached = e.detached;
    if (e.notes !== undefined) row.notes = e.notes;
    return row;
  }
};

export const eventSeriesStore: CloudStoreConfig<EventSeries, EventSeriesRow> = {
  table: "event_series",
  cap: 500,
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
    groupId: r.group_id,
    courseId: r.course_id,
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
    if (x.groupId !== undefined) row.group_id = x.groupId;
    if (x.courseId !== undefined) row.course_id = x.courseId;
    if (x.notes !== undefined) row.notes = x.notes;
    return row;
  }
};

/* ── Estudios ── */

export interface CourseRow {
  id: string;
  name: string;
  kind: Course["kind"];
  status: Course["status"];
  institution: string;
  teacher_contact_id: string | null;
  modality: Course["modality"];
  location: string;
  url: string;
  start_date: string | null;
  end_date: string | null;
  series_id: string | null;
  cost: number | string | null;
  payment_plan: Course["paymentPlan"];
  recurring_rule_id: string | null;
  notes: string;
  created_at: string;
}

export const courseStore: CloudStoreConfig<Course, CourseRow> = {
  table: "courses",
  cap: 500,
  fromRow: (r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    status: r.status,
    institution: r.institution,
    teacherContactId: r.teacher_contact_id,
    modality: r.modality,
    location: r.location,
    url: r.url,
    startDate: r.start_date,
    endDate: r.end_date,
    seriesId: r.series_id,
    cost: r.cost === null || r.cost === undefined ? null : Number(r.cost),
    paymentPlan: r.payment_plan,
    recurringRuleId: r.recurring_rule_id,
    notes: r.notes,
    createdAt: r.created_at.slice(0, 10)
  }),
  toRow: (c) => {
    const row: Partial<CourseRow> = {};
    if (c.id !== undefined) row.id = c.id;
    if (c.name !== undefined) row.name = c.name;
    if (c.kind !== undefined) row.kind = c.kind;
    if (c.status !== undefined) row.status = c.status;
    if (c.institution !== undefined) row.institution = c.institution;
    if (c.teacherContactId !== undefined) row.teacher_contact_id = c.teacherContactId;
    if (c.modality !== undefined) row.modality = c.modality;
    if (c.location !== undefined) row.location = c.location;
    if (c.url !== undefined) row.url = c.url;
    if (c.startDate !== undefined) row.start_date = c.startDate;
    if (c.endDate !== undefined) row.end_date = c.endDate;
    if (c.seriesId !== undefined) row.series_id = c.seriesId;
    if (c.cost !== undefined) row.cost = c.cost;
    if (c.paymentPlan !== undefined) row.payment_plan = c.paymentPlan;
    if (c.recurringRuleId !== undefined) row.recurring_rule_id = c.recurringRuleId;
    if (c.notes !== undefined) row.notes = c.notes;
    return row;
  }
};

export interface AssignmentRow {
  id: string;
  course_id: string;
  title: string;
  description: string;
  due_date: string | null;
  due_time: string | null;
  status: Assignment["status"];
  completed_at: string | null;
  project_id: string | null;
  grade: string;
  feedback: string;
  created_at: string;
}

export const assignmentStore: CloudStoreConfig<Assignment, AssignmentRow> = {
  table: "assignments",
  cap: 10_000,
  fromRow: (r) => ({
    id: r.id,
    courseId: r.course_id,
    title: r.title,
    description: r.description,
    dueDate: r.due_date,
    dueTime: r.due_time ? r.due_time.slice(0, 5) : null,
    status: r.status,
    completedAt: r.completed_at ? r.completed_at.slice(0, 10) : null,
    projectId: r.project_id,
    grade: r.grade,
    feedback: r.feedback,
    createdAt: r.created_at.slice(0, 10)
  }),
  toRow: (a) => {
    const row: Partial<AssignmentRow> = {};
    if (a.id !== undefined) row.id = a.id;
    if (a.courseId !== undefined) row.course_id = a.courseId;
    if (a.title !== undefined) row.title = a.title;
    if (a.description !== undefined) row.description = a.description;
    if (a.dueDate !== undefined) row.due_date = a.dueDate;
    if (a.dueTime !== undefined) row.due_time = a.dueTime;
    if (a.status !== undefined) row.status = a.status;
    if (a.completedAt !== undefined) row.completed_at = a.completedAt;
    if (a.projectId !== undefined) row.project_id = a.projectId;
    if (a.grade !== undefined) row.grade = a.grade;
    if (a.feedback !== undefined) row.feedback = a.feedback;
    return row;
  }
};

/* ── Notas ── */

export interface NoteRow {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  course_id: string | null;
  event_id: string | null;
  assignment_id: string | null;
  project_id: string | null;
  cover_attachment_id: string | null;
  created_at: string;
  updated_at: string;
}

export const noteStore: CloudStoreConfig<Note, NoteRow> = {
  table: "notes",
  cap: 10_000,
  fromRow: (r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    pinned: r.pinned,
    courseId: r.course_id,
    eventId: r.event_id,
    assignmentId: r.assignment_id,
    projectId: r.project_id,
    coverAttachmentId: r.cover_attachment_id ?? null,
    createdAt: r.created_at.slice(0, 10),
    updatedAt: r.updated_at
  }),
  // updated_at is the server's (trigger); a local patch may carry a
  // fresh updatedAt for the recency groups, and it stays local.
  toRow: (n) => {
    const row: Partial<NoteRow> = {};
    if (n.id !== undefined) row.id = n.id;
    if (n.title !== undefined) row.title = n.title;
    if (n.content !== undefined) row.content = n.content;
    if (n.pinned !== undefined) row.pinned = n.pinned;
    if (n.courseId !== undefined) row.course_id = n.courseId;
    if (n.eventId !== undefined) row.event_id = n.eventId;
    if (n.assignmentId !== undefined) row.assignment_id = n.assignmentId;
    if (n.projectId !== undefined) row.project_id = n.projectId;
    if (n.coverAttachmentId !== undefined) row.cover_attachment_id = n.coverAttachmentId;
    return row;
  }
};

/* ── Material ── */

export interface DocumentRow {
  id: string;
  kind: Document["kind"];
  name: string;
  r2_path: string | null;
  url: string | null;
  mime: string;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  course_id: string | null;
  assignment_id: string | null;
  project_id: string | null;
  event_id: string | null;
  created_at: string;
}

export const documentStore: CloudStoreConfig<Document, DocumentRow> = {
  table: "documents",
  cap: 20_000,
  fromRow: (r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    r2Path: r.r2_path,
    url: r.url,
    mime: r.mime,
    sizeBytes: r.size_bytes,
    width: r.width,
    height: r.height,
    courseId: r.course_id,
    assignmentId: r.assignment_id,
    projectId: r.project_id,
    eventId: r.event_id,
    createdAt: r.created_at.slice(0, 10)
  }),
  toRow: (d) => {
    const row: Partial<DocumentRow> = {};
    if (d.id !== undefined) row.id = d.id;
    if (d.kind !== undefined) row.kind = d.kind;
    if (d.name !== undefined) row.name = d.name;
    if (d.r2Path !== undefined) row.r2_path = d.r2Path;
    if (d.url !== undefined) row.url = d.url;
    if (d.mime !== undefined) row.mime = d.mime;
    if (d.sizeBytes !== undefined) row.size_bytes = d.sizeBytes;
    if (d.width !== undefined) row.width = d.width;
    if (d.height !== undefined) row.height = d.height;
    if (d.courseId !== undefined) row.course_id = d.courseId;
    if (d.assignmentId !== undefined) row.assignment_id = d.assignmentId;
    if (d.projectId !== undefined) row.project_id = d.projectId;
    if (d.eventId !== undefined) row.event_id = d.eventId;
    return row;
  }
};

export interface NoteAttachmentRow {
  id: string;
  note_id: string;
  r2_path: string;
  mime: string;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

export const noteAttachmentStore: CloudStoreConfig<NoteAttachment, NoteAttachmentRow> = {
  table: "note_attachments",
  cap: 20_000,
  fromRow: (r) => ({
    id: r.id,
    noteId: r.note_id,
    r2Path: r.r2_path,
    mime: r.mime,
    sizeBytes: r.size_bytes,
    width: r.width,
    height: r.height,
    createdAt: r.created_at.slice(0, 10)
  }),
  toRow: (a) => {
    const row: Partial<NoteAttachmentRow> = {};
    if (a.id !== undefined) row.id = a.id;
    if (a.noteId !== undefined) row.note_id = a.noteId;
    if (a.r2Path !== undefined) row.r2_path = a.r2Path;
    if (a.mime !== undefined) row.mime = a.mime;
    if (a.sizeBytes !== undefined) row.size_bytes = a.sizeBytes;
    if (a.width !== undefined) row.width = a.width;
    if (a.height !== undefined) row.height = a.height;
    return row;
  }
};

export interface NoteTagRow {
  id: string;
  label: string;
  color: string;
  created_at: string;
}

export const noteTagStore: CloudStoreConfig<NoteTag, NoteTagRow> = {
  table: "note_tags",
  cap: 200,
  fromRow: (r) => ({ id: r.id, label: r.label, color: r.color, createdAt: r.created_at.slice(0, 10) }),
  toRow: (t) => {
    const row: Partial<NoteTagRow> = {};
    if (t.id !== undefined) row.id = t.id;
    if (t.label !== undefined) row.label = t.label;
    if (t.color !== undefined) row.color = t.color;
    return row;
  }
};

export interface NoteTagLinkRow {
  id: string;
  note_id: string;
  tag_id: string;
  created_at: string;
}

export const noteTagLinkStore: CloudStoreConfig<NoteTagLink, NoteTagLinkRow> = {
  table: "note_tag_links",
  cap: 20_000,
  fromRow: (r) => ({ id: r.id, noteId: r.note_id, tagId: r.tag_id, createdAt: r.created_at.slice(0, 10) }),
  toRow: (l) => {
    const row: Partial<NoteTagLinkRow> = {};
    if (l.id !== undefined) row.id = l.id;
    if (l.noteId !== undefined) row.note_id = l.noteId;
    if (l.tagId !== undefined) row.tag_id = l.tagId;
    return row;
  }
};

/* ── Clases ── */

export interface ClassGroupRow {
  id: string;
  name: string;
  series_id: string | null;
  tuition_amount: number | string | null;
  tuition_cadence: ClassGroup["tuitionCadence"];
  capacity: number | null;
  location: string;
  active: boolean;
  notes: string;
  created_at: string;
}

export interface ClassEnrollmentRow {
  id: string;
  group_id: string;
  contact_id: string;
  started_on: string;
  ended_on: string | null;
  recurring_rule_id: string | null;
  notes: string;
  created_at: string;
}

export interface AttendanceRow {
  id: string;
  event_id: string;
  contact_id: string;
  status: Attendance["status"];
  created_at: string;
}

export const classGroupStore: CloudStoreConfig<ClassGroup, ClassGroupRow> = {
  table: "class_groups",
  cap: 200,
  fromRow: (r) => ({
    id: r.id,
    name: r.name,
    seriesId: r.series_id,
    tuitionAmount: r.tuition_amount === null ? null : Number(r.tuition_amount),
    tuitionCadence: r.tuition_cadence,
    capacity: r.capacity,
    location: r.location,
    active: r.active,
    notes: r.notes,
    createdAt: r.created_at.slice(0, 10)
  }),
  toRow: (g) => {
    const row: Partial<ClassGroupRow> = {};
    if (g.id !== undefined) row.id = g.id;
    if (g.name !== undefined) row.name = g.name;
    if (g.seriesId !== undefined) row.series_id = g.seriesId;
    if (g.tuitionAmount !== undefined) row.tuition_amount = g.tuitionAmount;
    if (g.tuitionCadence !== undefined) row.tuition_cadence = g.tuitionCadence;
    if (g.capacity !== undefined) row.capacity = g.capacity;
    if (g.location !== undefined) row.location = g.location;
    if (g.active !== undefined) row.active = g.active;
    if (g.notes !== undefined) row.notes = g.notes;
    return row;
  }
};

export const classEnrollmentStore: CloudStoreConfig<ClassEnrollment, ClassEnrollmentRow> = {
  table: "class_enrollments",
  cap: 2_000,
  fromRow: (r) => ({
    id: r.id,
    groupId: r.group_id,
    contactId: r.contact_id,
    startedOn: r.started_on,
    endedOn: r.ended_on,
    recurringRuleId: r.recurring_rule_id,
    notes: r.notes,
    createdAt: r.created_at.slice(0, 10)
  }),
  toRow: (e) => {
    const row: Partial<ClassEnrollmentRow> = {};
    if (e.id !== undefined) row.id = e.id;
    if (e.groupId !== undefined) row.group_id = e.groupId;
    if (e.contactId !== undefined) row.contact_id = e.contactId;
    if (e.startedOn !== undefined) row.started_on = e.startedOn;
    if (e.endedOn !== undefined) row.ended_on = e.endedOn;
    if (e.recurringRuleId !== undefined) row.recurring_rule_id = e.recurringRuleId;
    if (e.notes !== undefined) row.notes = e.notes;
    return row;
  }
};

/* Fastest-growing table (one row per session x student) and the one that
   CANNOT be windowed: the row carries event_id, not a session date, and
   utils/classes.ts::attendanceRate reads a student's whole history. A
   created_at window would quietly corrupt that rate. Capped only. */
export const attendanceStore: CloudStoreConfig<Attendance, AttendanceRow> = {
  table: "attendance",
  cap: 40_000,
  fromRow: (r) => ({
    id: r.id,
    eventId: r.event_id,
    contactId: r.contact_id,
    status: r.status,
    createdAt: r.created_at.slice(0, 10)
  }),
  toRow: (a) => {
    const row: Partial<AttendanceRow> = {};
    if (a.id !== undefined) row.id = a.id;
    if (a.eventId !== undefined) row.event_id = a.eventId;
    if (a.contactId !== undefined) row.contact_id = a.contactId;
    if (a.status !== undefined) row.status = a.status;
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
  course_id: string | null;
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
  group_id: string | null;
  course_id: string | null;
  active: boolean;
  notes: string;
  created_at: string;
}

export const saleStore: CloudStoreConfig<Sale, SaleRow> = {
  table: "sales",
  cap: 20_000,
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
  cap: 40_000,
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
  cap: 20_000,
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
  cap: 20_000,
  fromRow: (r) => ({
    id: r.id,
    title: r.title,
    amount: Number(r.amount),
    date: r.date,
    category: r.category,
    method: r.method,
    projectId: r.project_id,
    eventId: r.event_id,
    courseId: r.course_id,
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
    if (e.courseId !== undefined) row.course_id = e.courseId;
    if (e.recurringRuleId !== undefined) row.recurring_rule_id = e.recurringRuleId;
    if (e.periodKey !== undefined) row.period_key = e.periodKey;
    if (e.notes !== undefined) row.notes = e.notes;
    return row;
  }
};

export const recurringRuleStore: CloudStoreConfig<RecurringRule, RecurringRuleRow> = {
  table: "recurring_rules",
  cap: 1_000,
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
    groupId: r.group_id,
    courseId: r.course_id,
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
    if (x.groupId !== undefined) row.group_id = x.groupId;
    if (x.courseId !== undefined) row.course_id = x.courseId;
    if (x.active !== undefined) row.active = x.active;
    if (x.notes !== undefined) row.notes = x.notes;
    return row;
  }
};
