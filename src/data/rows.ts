import type { Contact, Project, ScheduleEvent } from "../types";
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
    if (e.notes !== undefined) row.notes = e.notes;
    return row;
  }
};
