import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
/* Defined next to the copy that translates it for her, so the sentinel
   this file sets and the message she reads cannot drift apart. */
import { MISSING_ROW } from "../lib/writeErrors";
import { addDays, todayISO } from "../utils/dates";

export interface Entity {
  id: string;
}

export interface LoadOrder {
  column: string;
  ascending: boolean;
}

/** A rolling date window, relative to today, on one date column. */
export interface DateWindow {
  column: string;
  /** Days of history held. */
  back: number;
  /** Days ahead held. Must exceed every generator horizon that diffs this table. */
  ahead: number;
}

export interface CloudStoreConfig<T extends Entity, Row> {
  table: string;
  fromRow: (row: Row) => T;
  toRow: (patch: Partial<T>) => Partial<Row>;
  /** Ceiling for one load. Past it the store reports itself partial.
      Required on purpose: a store nobody sized is a compile error, not a
      silent default. Size it ~20x plausible volume — a cap is a bug
      detector, not a product limit. */
  cap: number;
  /** Load order; `id` is always appended as the paging tiebreak. */
  order?: LoadOrder;
  /** Omitted = the whole table (still capped). See the note on `covers`. */
  window?: DateWindow | null;
}

/** What one load actually managed to fetch. A read problem, never a write one. */
export interface LoadReport {
  /** The server has more rows matching the filter than this store holds. */
  truncated: boolean;
  loaded: number;
  /** Rows matching the filter server-side, or null when the count failed. */
  total: number | null;
  /** The span this store is guaranteed to hold; null = the whole table. */
  coverage: { from: string; to: string } | null;
  /** A failed READ. Kept apart from `error`, which means a failed WRITE. */
  readError: string | null;
}

export interface CloudStore<T extends Entity> {
  items: T[];
  loading: boolean;
  /** Mutations the server hasn't acknowledged yet — inserts, patches and
      deletes alike. A child row (a cuota, a materialized expense) must
      wait for this to reach 0 before it references a parent written
      moments ago, or the FK rejects it; the materializers wait on it so
      they never diff against a list mid-flight. */
  inflight: number;
  /** A rejected WRITE, already reverted. */
  error: string | null;
  clearError: () => void;
  /** How complete the last read was. */
  load: LoadReport;
  reload: () => Promise<void>;
  /** Widen the date window to cover from..to and re-read. No-op unwindowed. */
  ensureDateRange: (from: string, to: string) => Promise<void>;
  /** Resolves true once the server accepted the row (or already had it). */
  add: (item: T) => Promise<boolean>;
  /** Insert several rows in ONE request — a plan, a materialized batch. */
  addMany: (items: T[]) => Promise<boolean>;
  /** Resolves true once the server accepted the patch; false after a revert. */
  update: (id: string, patch: Partial<T>) => Promise<boolean>;
  /** Resolves true once the server accepted the delete; false after a revert.
      Callers that mirror a server-side cascade with `dropLocal` MUST gate on
      this — dropping children for a delete the server rejected leaves the
      parent restored and its children missing locally, and every balance
      derived from that truncated list is wrong. */
  remove: (id: string) => Promise<boolean>;
  /** Delete several rows in ONE request. */
  removeMany: (ids: string[]) => Promise<boolean>;
  /** Drop rows from local state only — mirrors a server-side cascade. */
  dropLocal: (predicate: (item: T) => boolean) => void;
}

/* Postgres unique_violation. An insert that trips a unique index is not
   a failed write — it means the row already exists (another device ran
   the same idempotent generator first). Converge on the server's copy. */
const UNIQUE_VIOLATION = "23505";

/* One request's worth of rows. The loop advances by rows RECEIVED, so it
   stays correct whatever the project's PostgREST `db-max-rows` is; this
   only decides how many round trips a large table costs. */
const PAGE = 1000;

/* No request in this app had a deadline. `loading` is the OR of all
   nineteen stores, so a single socket that never answers — studio wifi
   behind a captive portal that blackholes TCP instead of resetting it —
   left the skeleton on screen forever, with no error and no retry, against
   a product standard that promises "never a frozen spinner". A read that
   has not answered by now is a failed read, which the UI already knows how
   to report and offer a Recargar for.

   READS ONLY, on purpose. A write has no safe deadline: aborting one the
   server went on to commit would revert it locally and leave the app
   disagreeing with Postgres about a row that exists — strictly worse than
   waiting. Writes stay open and are reconciled by the next reload. */
const READ_TIMEOUT_MS = 15_000;

/** An abort signal that fires after `ms`, plus the cleanup that cancels it. */
export function deadline(ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

/** Does `coverage` include the whole range? A null coverage is everything. */
export function covers(coverage: { from: string; to: string } | null, from: string, to: string): boolean {
  return coverage === null || (coverage.from <= from && coverage.to >= to);
}

/* Can a "what is missing" diff over from..to be trusted against these
   stores? A generator computes what to INSERT by diffing against the
   loaded rows, so a partial read does not make its answer stale — it
   makes it wrong, and the insert it provokes is rejected as a duplicate
   forever. Both ends matter: materialize.ts scans back to each rule's
   own startDate, series.ts forward to SERIES_HORIZON_DAYS. */
export function canDiff(
  reports: Pick<LoadReport, "truncated" | "coverage" | "readError">[],
  from: string,
  to: string
): boolean {
  /* A failed read is the most dangerous input of all: `reload` leaves the
     PREVIOUS truncated/coverage in place and only stamps `readError`, so on
     a first load that is EMPTY_LOAD — `truncated: false`, `coverage: null` —
     and a store holding zero rows would otherwise report itself complete.
     The generator would then diff its whole horizon against nothing and
     insert a duplicate of every row the table already holds. Fail closed. */
  return reports.every((r) => r.readError === null && !r.truncated && covers(r.coverage, from, to));
}

/** Rounds of generator writes allowed per session, then latched shut. */
export function makeBreaker(max: number) {
  let used = 0;
  return {
    take(): boolean {
      if (used >= max) return false;
      used += 1;
      return true;
    },
    get tripped() {
      return used >= max;
    }
  };
}

/** The order + span one reload should ask for. Pure, so it is testable. */
export function loadPlan<T extends Entity, Row>(
  config: CloudStoreConfig<T, Row>,
  today: string,
  requested: { from: string; to: string } | null
): { order: LoadOrder; span: { from: string; to: string } | null; cap: number } {
  const order = config.order ?? { column: "created_at", ascending: false };
  if (!config.window) return { order, span: null, cap: config.cap };
  const base = {
    from: addDays(today, -config.window.back),
    to: addDays(today, config.window.ahead)
  };
  const span = requested
    ? {
        from: requested.from < base.from ? requested.from : base.from,
        to: requested.to > base.to ? requested.to : base.to
      }
    : base;
  return { order, span, cap: config.cap };
}

/* Was the read short of what the server holds? `limit + 1` cannot answer
   this: PostgREST caps every response at `db-max-rows`, so asking for
   cap+1 rows past that cap returns exactly the cap and looks complete —
   affirmatively claiming "all of it" over a truncated list. Hence the
   exact count, and fail-safe when the count itself failed. */
export function truncationOf(loaded: number, total: number | null, cap: number): boolean {
  return total === null ? loaded >= cap : loaded < total;
}

export type PendingKind = "write" | "delete";

/** Ids a mutation is still holding. Refcounted: one id can be held twice. */
export class PendingLedger {
  private writes = new Map<string, number>();
  private deletes = new Map<string, number>();

  hold(ids: string[], kind: PendingKind) {
    const m = kind === "delete" ? this.deletes : this.writes;
    for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  }

  release(ids: string[], kind: PendingKind) {
    const m = kind === "delete" ? this.deletes : this.writes;
    for (const id of ids) {
      const n = (m.get(id) ?? 0) - 1;
      if (n > 0) m.set(id, n);
      else m.delete(id);
    }
  }

  /** A delete in flight wins: local state has already dropped the row. */
  snapshot(): Map<string, PendingKind> {
    const out = new Map<string, PendingKind>();
    for (const id of this.writes.keys()) out.set(id, "write");
    for (const id of this.deletes.keys()) out.set(id, "delete");
    return out;
  }
}

/* Fold a fresh read into local state without discarding rows a mutation
   is still holding. A generation counter alone cannot do this: a reload
   that legitimately starts AFTER the previous one can still be in flight
   when an insert lands, and its answer predates that row. Pure. */
export function mergeLoaded<T extends Entity>(
  current: T[],
  fetched: T[],
  pending: Map<string, PendingKind>
): T[] {
  if (pending.size === 0) return fetched;
  const local = new Map(current.map((it) => [it.id, it]));
  const out: T[] = [];
  const seen = new Set<string>();
  for (const row of fetched) {
    const kind = pending.get(row.id);
    if (kind === "delete") continue; // dropped locally; the server hasn't caught up
    seen.add(row.id);
    // A pending patch is newer than anything this read can carry.
    out.push(kind === "write" ? (local.get(row.id) ?? row) : row);
  }
  const heldOnly = current.filter((it) => pending.get(it.id) === "write" && !seen.has(it.id));
  return [...heldOnly, ...out];
}

const EMPTY_LOAD: LoadReport = { truncated: false, loaded: 0, total: 0, coverage: null, readError: null };

// Optimistic CRUD over one Supabase table, scoped to a workspace. Every
// mutation applies locally first and restores what IT changed if the
// server rejects it, so the UI never shows a half-applied write.
//
// `listRef` + `commit` keep a synchronous mirror of the list, because
// sheets fire several mutations in one tick (every future session of a
// series, every student's attendance) and each must build on the result
// of the last, not on whatever the most recent render saw.
export function useCloudStore<T extends Entity, Row extends { id: string }>(
  workspaceId: string | null,
  config: CloudStoreConfig<T, Row>
): CloudStore<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [inflight, setInflight] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [load, setLoad] = useState<LoadReport>(EMPTY_LOAD);

  const listRef = useRef<T[]>(items);
  const commit = useCallback((next: T[]) => {
    listRef.current = next;
    setItems(next);
  }, []);

  /** Bumped by every read; a read whose generation is stale contributes nothing. */
  const generation = useRef(0);
  /** Monotonic widening of the window; never narrows within a session. */
  const requested = useRef<{ from: string; to: string } | null>(null);
  const ledger = useRef(new PendingLedger());

  const reload = useCallback(async () => {
    if (!workspaceId) {
      generation.current += 1;
      commit([]);
      setLoad(EMPTY_LOAD);
      setLoading(false);
      return;
    }
    const gen = ++generation.current;
    const { order, span, cap } = loadPlan(config, todayISO(), requested.current);

    const rows: Row[] = [];
    let total: number | null = null;
    let readError: string | null = null;

    while (rows.length < cap) {
      const size = Math.min(PAGE, cap - rows.length);
      let q = supabase
        .from(config.table)
        .select("*", rows.length === 0 ? { count: "exact" } : undefined)
        .eq("workspace_id", workspaceId)
        .order(order.column, { ascending: order.ascending })
        // id is the tiebreak: two rows sharing a created_at can otherwise
        // swap between pages, fetching one twice and skipping another.
        .order("id", { ascending: true })
        .range(rows.length, rows.length + size - 1);
      if (span && config.window) {
        q = q.gte(config.window.column, span.from).lte(config.window.column, span.to);
      }
      const { signal, done } = deadline(READ_TIMEOUT_MS);
      let data, readErr, count;
      try {
        ({ data, error: readErr, count } = await q.abortSignal(signal));
      } finally {
        done();
      }
      if (gen !== generation.current) return; // a newer read already won
      if (readErr) {
        readError = readErr.message;
        break;
      }
      if (rows.length === 0) total = count ?? null;
      const page = (data ?? []) as Row[];
      if (page.length === 0) break;
      rows.push(...page);
      if (total !== null && rows.length >= total) break;
    }
    if (gen !== generation.current) return;

    if (readError) {
      setLoad((prev) => ({ ...prev, readError }));
      setLoading(false);
      return;
    }
    const fetched = rows.map(config.fromRow);
    commit(mergeLoaded(listRef.current, fetched, ledger.current.snapshot()));
    setLoad({
      truncated: truncationOf(fetched.length, total, cap),
      loaded: fetched.length,
      total,
      coverage: span,
      readError: null
    });
    setLoading(false);
  }, [workspaceId, config, commit]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  const ensureDateRange = useCallback(
    async (from: string, to: string) => {
      if (!config.window) return;
      const cur = requested.current;
      const next = {
        from: cur && cur.from < from ? cur.from : from,
        to: cur && cur.to > to ? cur.to : to
      };
      if (cur && cur.from === next.from && cur.to === next.to) return;
      requested.current = next;
      await reload();
    },
    [config.window, reload]
  );

  /* Which of these ids does the server actually hold? A 23505 says SOME
     unique index rejected the row, never which one, so it cannot be read as
     "the row you wanted is already there" — a duplicate on an unrelated
     constraint would hand the caller an id that was never persisted, and the
     FK child it then writes under that id is rejected. null means the
     question could not be answered; the caller converges via reload rather
     than guessing. */
  const landedIds = useCallback(
    async (ids: string[]): Promise<Set<string> | null> => {
      if (!workspaceId) return null;
      const { data, error: checkErr } = await supabase
        .from(config.table)
        .select("id")
        .in("id", ids)
        .eq("workspace_id", workspaceId);
      if (checkErr) return null;
      return new Set((data ?? []).map((row) => (row as { id: string }).id));
    },
    [workspaceId, config]
  );

  const insertRows = useCallback(
    async (next: T[]): Promise<boolean> => {
      if (!workspaceId || next.length === 0) return false;
      const ids = next.map((it) => it.id);
      const rows = next.map(
        (item) => ({ ...config.toRow(item), workspace_id: workspaceId }) as Record<string, unknown>
      );
      commit([...next, ...listRef.current]);
      ledger.current.hold(ids, "write");
      setInflight((n) => n + 1);

      let ok = false;
      let converge = false;
      try {
        const { error: insertErr } = await supabase.from(config.table).insert(rows);
        if (!insertErr) {
          ok = true;
        } else if (insertErr.code !== UNIQUE_VIOLATION) {
          const gone = new Set(ids);
          commit(listRef.current.filter((it) => !gone.has(it.id)));
          setError(insertErr.message);
        } else {
          // Postgres refuses the whole batch for one duplicate. Retry each
          // row alone so one duplicate cannot mask its siblings.
          let firstMessage: string | null = null;
          if (rows.length > 1) {
            for (let i = 0; i < rows.length; i++) {
              const { error: one } = await supabase.from(config.table).insert(rows[i]);
              if (one && one.code !== UNIQUE_VIOLATION) firstMessage ??= one.message;
            }
          }
          /* Then let the server settle it. Anything still absent was refused
             by a constraint other than the one the caller's generator is
             keyed on, which is a real failed write, not a convergence. */
          const present = await landedIds(ids);
          if (present === null) {
            // Could not confirm. Do not claim success — reload and let the
            // server's copy decide what the list holds.
            converge = true;
          } else {
            const missing = next.filter((it) => !present.has(it.id));
            if (missing.length === 0) {
              ok = true;
              converge = true;
            } else {
              const gone = new Set(missing.map((it) => it.id));
              commit(listRef.current.filter((it) => !gone.has(it.id)));
              setError(firstMessage ?? insertErr.message);
            }
          }
        }
      } finally {
        // Released before the convergence read so the server's copy wins.
        ledger.current.release(ids, "write");
        setInflight((n) => n - 1);
      }
      if (converge) await reload();
      return ok;
    },
    [workspaceId, config, reload, commit, landedIds]
  );

  const add = useCallback((item: T) => insertRows([item]), [insertRows]);
  const addMany = useCallback((next: T[]) => insertRows(next), [insertRows]);

  const update = useCallback(
    async (id: string, patch: Partial<T>): Promise<boolean> => {
      if (!workspaceId) return false;
      const keys = Object.keys(patch) as (keyof T)[];
      if (keys.length === 0) return true;
      const before = listRef.current.find((it) => it.id === id);
      if (!before) return false;
      commit(listRef.current.map((it) => (it.id === id ? { ...it, ...patch } : it)));
      ledger.current.hold([id], "write");
      setInflight((n) => n + 1);

      let ok = false;
      try {
        // .select() is what makes a 0-row match visible: without it
        // PostgREST answers `error: null` for a row RLS hid or another
        // device deleted, and a write that changed nothing reads as saved.
        const { data, error: updateErr } = await supabase
          .from(config.table)
          .update(config.toRow(patch) as Record<string, unknown>)
          .eq("id", id)
          .eq("workspace_id", workspaceId)
          .select("id");
        if (!updateErr && (data?.length ?? 0) > 0) {
          ok = true;
        } else {
          /* Revert only the fields this write still OWNS. Restoring every
             field it touched is safe against a sibling patch on DISJOINT
             fields, but not against a later patch to the SAME field: if B
             set `amount` after A did and B was accepted, A's revert would
             put the pre-A value back and silently discard B's accepted
             write. A field that no longer holds what A applied belongs to
             someone else now, so A leaves it alone. */
          commit(
            listRef.current.map((it) => {
              if (it.id !== id) return it;
              const restored = { ...it };
              for (const k of keys) {
                if (Object.is(it[k], patch[k])) restored[k] = before[k];
              }
              return restored;
            })
          );
          setError(updateErr ? updateErr.message : MISSING_ROW);
        }
      } finally {
        ledger.current.release([id], "write");
        setInflight((n) => n - 1);
      }
      return ok;
    },
    [workspaceId, config, commit]
  );

  const deleteRows = useCallback(
    async (ids: string[]): Promise<boolean> => {
      if (!workspaceId || ids.length === 0) return false;
      const gone = new Set(ids);
      const before = listRef.current;
      const removed = before.filter((it) => gone.has(it.id));
      // Nothing local to remove: the rows are already absent, which is the
      // caller's desired end state, so mirroring a cascade is still correct.
      if (removed.length === 0) return true;
      const at = new Map(removed.map((it) => [it.id, before.indexOf(it)]));
      commit(before.filter((it) => !gone.has(it.id)));
      const held = [...gone];
      ledger.current.hold(held, "delete");
      setInflight((n) => n + 1);

      let failed = false;
      try {
        const { error: deleteErr } = await supabase
          .from(config.table)
          .delete()
          .in("id", held)
          .eq("workspace_id", workspaceId);
        if (deleteErr) {
          failed = true;
          // Back where they were. Prepending would move every reverted row
          // to the head of a created_at-desc list — a visible reorder.
          const present = new Set(listRef.current.map((it) => it.id));
          const restored = [...listRef.current];
          for (const it of removed) {
            if (present.has(it.id)) continue;
            restored.splice(Math.min(at.get(it.id) ?? restored.length, restored.length), 0, it);
          }
          commit(restored);
          setError(deleteErr.message);
        }
      } finally {
        ledger.current.release(held, "delete");
        setInflight((n) => n - 1);
      }
      // A delete that matched nothing is the desired end state, so it is
      // not an error — but if RLS hid the row it still exists, and this
      // read brings it back visibly instead of diverging in silence.
      if (!failed) void reload();
      return !failed;
    },
    [workspaceId, config, commit, reload]
  );

  const remove = useCallback((id: string) => deleteRows([id]), [deleteRows]);
  const removeMany = useCallback((ids: string[]) => deleteRows(ids), [deleteRows]);

  // Local-only prune, for mirroring a server-side cascade. The rows are
  // already gone in Postgres; this stops a derivation from seeing orphans
  // in the window between the delete and the next load.
  const dropLocal = useCallback(
    (predicate: (item: T) => boolean) => commit(listRef.current.filter((it) => !predicate(it))),
    [commit]
  );

  const clearError = useCallback(() => setError(null), []);

  /* Memoized because AppContext's `value` lists all 19 of these as
     dependencies. A fresh object literal each render made that useMemo
     ornamental — it recomputed every time — so every useApp() consumer
     re-rendered on any state change anywhere in the app. Every callback
     below is already stable; this makes the container stable too, and
     the identity now changes only when this store's own state does. */
  return useMemo(
    () => ({
      items,
      loading,
      inflight,
      error,
      clearError,
      load,
      reload,
      ensureDateRange,
      add,
      addMany,
      update,
      remove,
      removeMany,
      dropLocal
    }),
    [
      items,
      loading,
      inflight,
      error,
      clearError,
      load,
      reload,
      ensureDateRange,
      add,
      addMany,
      update,
      remove,
      removeMany,
      dropLocal
    ]
  );
}
