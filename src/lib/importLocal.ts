import { supabase } from "./supabase";
import { seedContacts, seedEvents, seedProjects } from "../data/seed";
import { contactStore, eventStore, projectStore } from "../data/rows";
import type { Contact, Project, ScheduleEvent } from "../types";

const KEYS = { contacts: "angus.contacts", projects: "angus.projects", events: "angus.events" };

function readLocal<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

// Data entered before sign-in lived in localStorage. Move it into the
// active workspace once (skipping the demo seed rows), then drop the local
// copy so the two stores can never diverge. Contacts go first because
// projects/events reference them.
export async function importLocalData(workspaceId: string): Promise<boolean> {
  const seedIds = new Set([...seedContacts, ...seedProjects, ...seedEvents].map((s) => s.id));
  const notSeed = <T extends { id: string }>(rows: T[]) => rows.filter((r) => !seedIds.has(r.id));

  const contacts = notSeed(readLocal<Contact>(KEYS.contacts));
  const projects = notSeed(readLocal<Project>(KEYS.projects));
  const events = notSeed(readLocal<ScheduleEvent>(KEYS.events));
  if (contacts.length + projects.length + events.length === 0) {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    return false;
  }

  const withWs = (rows: Record<string, unknown>[]) => rows.map((r) => ({ ...r, workspace_id: workspaceId }));
  // Each step is idempotent (ids are the client's, duplicates are
  // skipped) and clears its own key, so a failure midway resumes
  // where it stopped instead of re-inserting what already landed.
  const steps: [string, string, Record<string, unknown>[]][] = [
    [contactStore.table, KEYS.contacts, withWs(contacts.map(contactStore.toRow))],
    [projectStore.table, KEYS.projects, withWs(projects.map(projectStore.toRow))],
    [eventStore.table, KEYS.events, withWs(events.map(eventStore.toRow))]
  ];
  for (const [table, key, rows] of steps) {
    if (rows.length > 0) {
      const { error } = await supabase.from(table).upsert(rows, { onConflict: "id", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
    localStorage.removeItem(key);
  }
  return true;
}
