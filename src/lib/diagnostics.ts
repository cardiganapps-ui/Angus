/* ── Diagnóstico ──
   A small local record of what went wrong, for the pilot.

   The app had no error reporting of any kind: DataErrorToast showed one
   generic Spanish string and threw the real message away, and a render
   crash was a white page that left no trace. Two weeks of use with no
   instrument produces an anecdote, not evidence.

   Everything here stays on her device. Nothing is transmitted — she
   shares it deliberately from Ajustes → Diagnóstico, or not at all.

   MESSAGES ONLY, never row payloads. A Postgres constraint error can
   quote the values that tripped it, and this is the one file that would
   persist them; `truncate` bounds what a single message can carry, and
   callers pass `error.message`, never a row. */

export type DiagnosticKind = "write" | "read" | "partial" | "crash";

export interface DiagnosticEvent {
  /** ISO timestamp of the FIRST occurrence. */
  at: string;
  kind: DiagnosticKind;
  /** Where it happened, in her words or a table name — "guardar", "notes". */
  scope: string;
  message: string;
  /** Repeats collapse instead of filling the buffer. 1 means once. */
  count: number;
  /** ISO timestamp of the most recent occurrence, when count > 1. */
  lastAt?: string;
}

/** The subset of localStorage this needs, so tests can inject one. */
export interface DiagnosticsStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const DIAGNOSTICS_KEY = "angus.diagnostics";
export const MAX_EVENTS = 50;
const MAX_MESSAGE = 300;

/* A repeated failure (a rejected write she retries, a read that keeps
   failing offline) should read as "40 times", not evict 40 slots of
   history. Collapsed only against the newest entry, so an alternating
   pair still shows as two. */
export function appendEvent(
  events: DiagnosticEvent[],
  next: DiagnosticEvent,
  cap: number = MAX_EVENTS
): DiagnosticEvent[] {
  const head = events[0];
  if (head && head.kind === next.kind && head.scope === next.scope && head.message === next.message) {
    const merged: DiagnosticEvent = { ...head, count: head.count + 1, lastAt: next.at };
    return [merged, ...events.slice(1)];
  }
  return [next, ...events].slice(0, Math.max(1, cap));
}

export interface DiagnosticsSummary {
  /** Distinct entries held. */
  entries: number;
  /** Occurrences, counting repeats. */
  occurrences: number;
  byKind: Record<DiagnosticKind, number>;
  latest: DiagnosticEvent | null;
}

export function summarize(events: DiagnosticEvent[]): DiagnosticsSummary {
  const byKind: Record<DiagnosticKind, number> = { write: 0, read: 0, partial: 0, crash: 0 };
  let occurrences = 0;
  for (const e of events) {
    byKind[e.kind] += e.count;
    occurrences += e.count;
  }
  return { entries: events.length, occurrences, byKind, latest: events[0] ?? null };
}

/** Her one-line verdict. Calm when there is nothing to say. */
export function verdict(summary: DiagnosticsSummary): string {
  if (summary.occurrences === 0) return "Todo en orden";
  if (summary.byKind.crash > 0) return "Algo se rompió · revísalo";
  const n = summary.occurrences;
  return n === 1 ? "1 aviso" : `${n} avisos`;
}

function truncate(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > MAX_MESSAGE ? `${clean.slice(0, MAX_MESSAGE)}…` : clean;
}

function defaultStore(): DiagnosticsStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // private mode / blocked storage
  }
}

/* Mirrored in memory as well as storage: a crash-and-reload must not
   erase its own cause, and a device that refuses storage still gets a
   log for the length of the session. */
let memory: DiagnosticEvent[] = [];
let loaded = false;

function isEvent(v: unknown): v is DiagnosticEvent {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.at === "string" &&
    typeof e.message === "string" &&
    typeof e.scope === "string" &&
    typeof e.count === "number" &&
    (e.kind === "write" || e.kind === "read" || e.kind === "partial" || e.kind === "crash")
  );
}

export function readEvents(store: DiagnosticsStore | null = defaultStore()): DiagnosticEvent[] {
  if (loaded) return memory;
  loaded = true;
  if (!store) return memory;
  try {
    const raw = store.getItem(DIAGNOSTICS_KEY);
    if (!raw) return memory;
    const parsed: unknown = JSON.parse(raw);
    // A corrupt blob is discarded, never thrown: a broken log must not
    // be able to stop the app from starting.
    memory = Array.isArray(parsed) ? parsed.filter(isEvent).slice(0, MAX_EVENTS) : [];
  } catch {
    memory = [];
  }
  return memory;
}

export function recordEvent(
  kind: DiagnosticKind,
  scope: string,
  message: string,
  now: string = new Date().toISOString(),
  store: DiagnosticsStore | null = defaultStore()
): DiagnosticEvent[] {
  const events = readEvents(store);
  memory = appendEvent(events, { at: now, kind, scope, message: truncate(message), count: 1 });
  if (store) {
    try {
      store.setItem(DIAGNOSTICS_KEY, JSON.stringify(memory));
    } catch {
      /* quota / private mode — the in-memory copy still serves this session */
    }
  }
  return memory;
}

export function clearEvents(store: DiagnosticsStore | null = defaultStore()): void {
  memory = [];
  loaded = true;
  if (!store) return;
  try {
    store.removeItem(DIAGNOSTICS_KEY);
  } catch {
    /* non-fatal */
  }
}

/** Test seam: forget the loaded-from-storage latch. */
export function resetForTests(): void {
  memory = [];
  loaded = false;
}
