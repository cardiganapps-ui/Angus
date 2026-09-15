import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

export interface Entity {
  id: string;
}

export interface CloudStoreConfig<T extends Entity, Row> {
  table: string;
  fromRow: (row: Row) => T;
  toRow: (patch: Partial<T>) => Partial<Row>;
}

export interface CloudStore<T extends Entity> {
  items: T[];
  loading: boolean;
  /** Inserts the server hasn't acknowledged yet. A child row (a cuota,
      a materialized expense) must wait for this to reach 0 before it
      references a parent inserted moments ago, or the FK rejects it. */
  inflight: number;
  error: string | null;
  clearError: () => void;
  reload: () => Promise<void>;
  /** Resolves true once the server accepted the row (or already had it). */
  add: (item: T) => Promise<boolean>;
  /** Insert several rows in ONE request — a plan, a materialized batch. */
  addMany: (items: T[]) => Promise<boolean>;
  update: (id: string, patch: Partial<T>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Delete several rows in ONE request. */
  removeMany: (ids: string[]) => Promise<void>;
  /** Drop rows from local state only — mirrors a server-side cascade. */
  dropLocal: (predicate: (item: T) => boolean) => void;
}

/* Postgres unique_violation. An insert that trips a unique index is not
   a failed write — it means the row already exists (another device ran
   the same idempotent generator first). Keep the optimistic rows and
   re-read so both devices converge on the server's copy. */
const UNIQUE_VIOLATION = "23505";

// Optimistic CRUD over one Supabase table, scoped to a workspace. Every
// mutation applies locally first and restores what IT changed if the
// server rejects it, so the UI never shows a half-applied write.
//
// Both the apply and the revert are functional updates on the current
// list, never a snapshot: sheets fire several mutations in one tick
// (every future session of a series, every student's attendance), and a
// snapshot taken before the first would make the last one win locally
// and a failed one throw away its siblings' successes.
export function useCloudStore<T extends Entity, Row extends { id: string }>(
  workspaceId: string | null,
  config: CloudStoreConfig<T, Row>
): CloudStore<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [inflight, setInflight] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const reload = useCallback(async () => {
    if (!workspaceId) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from(config.table)
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setItems((data as Row[]).map(config.fromRow));
    setLoading(false);
  }, [workspaceId, config]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  const insertRows = useCallback(
    async (next: T[]): Promise<boolean> => {
      if (!workspaceId || next.length === 0) return false;
      const ids = new Set(next.map((it) => it.id));
      setItems((current) => [...next, ...current]);
      setInflight((n) => n + 1);
      const rows = next.map(
        (item) => ({ ...config.toRow(item), workspace_id: workspaceId }) as Record<string, unknown>
      );
      try {
        const { error } = await supabase.from(config.table).insert(rows);
        if (!error) return true;
        if (error.code === UNIQUE_VIOLATION) {
          await reload();
          return true;
        }
        setItems((current) => current.filter((it) => !ids.has(it.id)));
        setError(error.message);
        return false;
      } finally {
        setInflight((n) => n - 1);
      }
    },
    [workspaceId, config, reload]
  );

  const add = useCallback((item: T) => insertRows([item]), [insertRows]);
  const addMany = useCallback((next: T[]) => insertRows(next), [insertRows]);

  const update = useCallback(
    async (id: string, patch: Partial<T>) => {
      if (!workspaceId) return;
      // The prior row is read inside the updater so it is the row as it
      // stood when this patch applied, not as of the last render.
      let before: T | undefined = itemsRef.current.find((it) => it.id === id);
      setItems((current) =>
        current.map((it) => {
          if (it.id !== id) return it;
          before = it;
          return { ...it, ...patch };
        })
      );
      const { error } = await supabase
        .from(config.table)
        .update(config.toRow(patch) as Record<string, unknown>)
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) {
        const restore = before;
        if (restore) setItems((current) => current.map((it) => (it.id === id ? restore : it)));
        setError(error.message);
      }
    },
    [workspaceId, config]
  );

  const deleteRows = useCallback(
    async (ids: string[]) => {
      if (!workspaceId || ids.length === 0) return;
      const gone = new Set(ids);
      let removed: T[] = itemsRef.current.filter((it) => gone.has(it.id));
      setItems((current) => {
        removed = current.filter((it) => gone.has(it.id));
        return current.filter((it) => !gone.has(it.id));
      });
      const { error } = await supabase
        .from(config.table)
        .delete()
        .in("id", ids)
        .eq("workspace_id", workspaceId);
      if (error) {
        const back = removed;
        setItems((current) => {
          const present = new Set(current.map((it) => it.id));
          return [...back.filter((it) => !present.has(it.id)), ...current];
        });
        setError(error.message);
      }
    },
    [workspaceId, config]
  );

  const remove = useCallback((id: string) => deleteRows([id]), [deleteRows]);
  const removeMany = useCallback((ids: string[]) => deleteRows(ids), [deleteRows]);

  // Local-only prune, for mirroring a server-side cascade. The rows are
  // already gone in Postgres; this stops a derivation from seeing orphans
  // in the window between the delete and the next load.
  const dropLocal = useCallback((predicate: (item: T) => boolean) => {
    setItems((current) => current.filter((it) => !predicate(it)));
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    items,
    loading,
    inflight,
    error,
    clearError,
    reload,
    add,
    addMany,
    update,
    remove,
    removeMany,
    dropLocal
  };
}
