import { supabase } from "./supabase";
import { seedContacts, seedEvents, seedProjects } from "../data/seed";
import { contactStore, eventStore, projectStore } from "../data/rows";
import type { Contact, Project, ScheduleEvent } from "../types";

const KEYS = { contacts: "angus.contacts", projects: "angus.projects", events: "angus.events" };

/* Returns null when the key holds something unreadable, as opposed to
   an empty array for "nothing stored". The difference matters: the old
   version collapsed both to [], and the caller then cleared ALL THREE
   keys on the "nothing to import" path — so one corrupt blob destroyed
   the two good ones beside it. */
function readLocal<T>(key: string): T[] | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null; // storage blocked; nothing is safe to clear
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

// Data entered before sign-in lived in localStorage. Move it into the
// active workspace once (skipping the demo seed rows), then drop the local
// copy so the two stores can never diverge. Contacts go first because
// projects/events reference them.
export async function importLocalData(workspaceId: string): Promise<boolean> {
  const seedIds = new Set([...seedContacts, ...seedProjects, ...seedEvents].map((s) => s.id));
  const notSeed = <T extends { id: string }>(rows: T[]) => rows.filter((r) => !seedIds.has(r.id));

  const rawContacts = readLocal<Contact>(KEYS.contacts);
  const rawProjects = readLocal<Project>(KEYS.projects);
  const rawEvents = readLocal<ScheduleEvent>(KEYS.events);
  const contacts = notSeed(rawContacts ?? []);
  const projects = notSeed(rawProjects ?? []);
  const events = notSeed(rawEvents ?? []);

  if (contacts.length + projects.length + events.length === 0) {
    /* Clear only the keys that were actually readable and actually
       empty. A key we could not parse is left alone: it is the only
       copy of whatever it holds, and it might be recoverable by hand. */
    const clearable: string[] = [];
    if (rawContacts !== null) clearable.push(KEYS.contacts);
    if (rawProjects !== null) clearable.push(KEYS.projects);
    if (rawEvents !== null) clearable.push(KEYS.events);
    for (const k of clearable) {
      try {
        localStorage.removeItem(k);
      } catch {
        /* non-fatal */
      }
    }
    return false;
  }

  const withWs = (rows: Record<string, unknown>[]) => rows.map((r) => ({ ...r, workspace_id: workspaceId }));
  // Each step is idempotent (ids are the client's, duplicates are
  // skipped) and clears its own key, so a failure midway resumes
  // where it stopped instead of re-inserting what already landed.
  const steps: [string, string, Record<string, unknown>[], boolean][] = [
    [contactStore.table, KEYS.contacts, withWs(contacts.map(contactStore.toRow)), rawContacts !== null],
    [projectStore.table, KEYS.projects, withWs(projects.map(projectStore.toRow)), rawProjects !== null],
    [eventStore.table, KEYS.events, withWs(events.map(eventStore.toRow)), rawEvents !== null]
  ];
  for (const [table, key, rows, readable] of steps) {
    if (rows.length > 0) {
      const { error } = await supabase.from(table).upsert(rows, { onConflict: "id", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
    /* Same rule the nothing-to-import path above already follows, which
       this loop did not: a key we could not parse is the only copy of
       whatever it holds, so it is never cleared. An unparseable blob
       yields no rows, so this loop skipped its upsert and then deleted it
       anyway — destroying by-hand-recoverable data whenever a sibling key
       happened to have something in it. */
    if (readable) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* non-fatal: the rows landed, which is what matters */
      }
    }
  }
  return true;
}
