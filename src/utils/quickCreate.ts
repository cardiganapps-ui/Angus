import type {
  Assignment,
  Availability,
  Contact,
  ContactRelationship,
  Course,
  Project,
  ProjectStatus,
  ScheduleEvent
} from "../types";

/* ── Quick create ──
   What a picker makes when she types a name that isn't there yet.

   She does not always want a whole profile: linking an ingreso to "Lucía"
   should not mean filling in Lucía's phone, stage and follow-up first.
   So each builder takes the ONE thing she typed plus the context it came
   from, and produces exactly the row the entity's own sheet would have
   saved with only that field filled — same defaults, same shape — so the
   quick row and the full row are indistinguishable later. Everything else
   is edited from the entity's own screen whenever she cares to.

   Pure: no ids, no clock — the caller stamps `id` and `createdAt`, which
   keeps these testable and the hook the only place that touches time. */

export interface Stamp {
  id: string;
  createdAt: string;
}

/** A typed name is usable once it has a letter or digit in it. */
export function usableName(typed: string): boolean {
  return /[\p{L}\p{N}]/u.test(typed);
}

/* Names carry no unique index, so this is the only duplicate guard: the
   same contract as useNotes.upsertTag — trimmed, case-insensitive. */
export function findByName<T>(rows: T[], name: string, key: (row: T) => string): T | null {
  const wanted = name.trim().toLocaleLowerCase();
  if (!wanted) return null;
  return rows.find((row) => key(row).trim().toLocaleLowerCase() === wanted) ?? null;
}

export function quickContact(name: string, relationship: ContactRelationship, stamp: Stamp): Contact {
  return {
    ...stamp,
    name: name.trim(),
    relationship,
    email: "",
    phone: "",
    // Mirrors ContactSheet: a lead starts at "new"; anyone else has no stage.
    leadStage: relationship === "lead" ? "new" : null,
    followUpDate: null,
    notes: ""
  };
}

export interface QuickProjectOptions {
  /** What the context already says about the piece; ProjectSheet's own defaults otherwise. */
  status?: ProjectStatus;
  availability?: Availability;
  dueDate?: string | null;
  /** Who it is for, when the piece was born from a sale or an event with a contact. */
  contactId?: string | null;
  /** The course it was made for, when born from Estudios. */
  courseId?: string | null;
  /** Born from a sale: the sale's price is the best guess for the piece's. */
  price?: number | null;
}

export function quickProject(title: string, opts: QuickProjectOptions, stamp: Stamp): Project {
  return {
    ...stamp,
    title: title.trim(),
    medium: "",
    status: opts.status ?? "idea",
    availability: opts.availability ?? "available",
    startDate: null,
    dueDate: opts.dueDate ?? null,
    price: opts.price ?? null,
    cost: null,
    dimensions: "",
    year: null,
    edition: "",
    location: "",
    contactId: opts.contactId ?? null,
    courseId: opts.courseId ?? null,
    notes: ""
  };
}

/** An expo born from a sale or an expense: dated where the money was. */
export function quickExpo(title: string, date: string, stamp: Stamp): ScheduleEvent {
  return {
    ...stamp,
    title: title.trim(),
    kind: "expo",
    date,
    startTime: null,
    endTime: null,
    location: "",
    projectId: null,
    contactId: null,
    budget: null,
    courseId: null,
    missed: false,
    seriesId: null,
    cancelled: false,
    detached: false,
    notes: ""
  };
}

export function quickCourse(name: string, opts: { startDate?: string | null }, stamp: Stamp): Course {
  return {
    ...stamp,
    name: name.trim(),
    kind: "class",
    status: "active",
    institution: "",
    teacherContactId: null,
    modality: "in_person",
    location: "",
    url: "",
    // Mirrors CourseSheet: a course starts the day it is created unless
    // the context (a first session, a tuition rule) says when.
    startDate: opts.startDate ?? stamp.createdAt,
    endDate: null,
    seriesId: null,
    cost: null,
    paymentPlan: "single",
    recurringRuleId: null,
    notes: ""
  };
}

export function quickAssignment(title: string, courseId: string, stamp: Stamp): Assignment {
  return {
    ...stamp,
    courseId,
    title: title.trim(),
    description: "",
    dueDate: null,
    dueTime: null,
    status: "todo",
    completedAt: null,
    projectId: null,
    grade: "",
    feedback: ""
  };
}
