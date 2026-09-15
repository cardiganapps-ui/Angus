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
