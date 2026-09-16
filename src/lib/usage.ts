/* ── Uso ──
   A tally of which screens she actually opens, for the pilot.

   The gate's promise is to re-rank later work by what breaks AND what
   she ignores. The second half is otherwise unanswerable: "she lives in
   Agenda and never opens Reportes" would be a guess, and route splitting
   or a forecast rewrite would be prioritised on a hunch.

   Counts only — a route name and a number. No timestamps per visit, no
   sequence, nothing about what she typed or looked at. It stays on her
   device and is never transmitted; it is read in Ajustes → Diagnóstico
   and shared only if she chooses to.

   This is a pilot instrument, not an analytics layer. Stage 7 decides
   whether any of it stays. */

import type { DiagnosticsStore } from "./diagnostics";

export const USAGE_KEY = "angus.usage";

export interface Usage {
  /** When counting started, so a tally has a window. */
  since: string;
  counts: Record<string, number>;
}

/** Pure: one visit folded into a tally. */
export function countVisit(usage: Usage, route: string): Usage {
  return { since: usage.since, counts: { ...usage.counts, [route]: (usage.counts[route] ?? 0) + 1 } };
}

/** Busiest first, then alphabetical, so the readout is stable. */
export function rankRoutes(usage: Usage): { route: string; visits: number }[] {
  return Object.entries(usage.counts)
    .map(([route, visits]) => ({ route, visits }))
    .sort((a, b) => b.visits - a.visits || a.route.localeCompare(b.route));
}

/** Routes never opened at all — the half that says what to deprioritise. */
export function untouched(usage: Usage, all: readonly string[]): string[] {
  return all.filter((r) => !(usage.counts[r] > 0));
}

function defaultStore(): DiagnosticsStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function fresh(now: string): Usage {
  return { since: now, counts: {} };
}

let memory: Usage | null = null;

function isUsage(v: unknown): v is Usage {
  if (typeof v !== "object" || v === null) return false;
  const u = v as Record<string, unknown>;
  if (typeof u.since !== "string" || typeof u.counts !== "object" || u.counts === null) return false;
  return Object.values(u.counts as Record<string, unknown>).every((n) => typeof n === "number");
}

export function readUsage(
  now: string = new Date().toISOString(),
  store: DiagnosticsStore | null = defaultStore()
): Usage {
  if (memory) return memory;
  if (!store) {
    memory = fresh(now);
    return memory;
  }
  try {
    const raw = store.getItem(USAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    // A corrupt tally is worth nothing and must not break a render.
    memory = isUsage(parsed) ? parsed : fresh(now);
  } catch {
    memory = fresh(now);
  }
  return memory;
}

export function recordVisit(
  route: string,
  now: string = new Date().toISOString(),
  store: DiagnosticsStore | null = defaultStore()
): Usage {
  memory = countVisit(readUsage(now, store), route);
  if (store) {
    try {
      store.setItem(USAGE_KEY, JSON.stringify(memory));
    } catch {
      /* quota / private mode — non-fatal */
    }
  }
  return memory;
}

export function clearUsage(
  now: string = new Date().toISOString(),
  store: DiagnosticsStore | null = defaultStore()
): void {
  memory = fresh(now);
  if (!store) return;
  try {
    store.removeItem(USAGE_KEY);
  } catch {
    /* non-fatal */
  }
}

/** Test seam: forget the in-memory copy. */
export function resetForTests(): void {
  memory = null;
}
