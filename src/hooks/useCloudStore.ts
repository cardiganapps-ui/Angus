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
  error: string | null;
  clearError: () => void;
  reload: () => Promise<void>;
  add: (item: T) => Promise<void>;
  /** Insert several rows in ONE request — a plan, a materialized batch. */
  addMany: (items: T[]) => Promise<void>;
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
// mutation applies locally first and restores the prior list if the server
// rejects it, so the UI never shows a half-applied write.
export function useCloudStore<T extends Entity, Row extends { id: string }>(
  workspaceId: string | null,
  config: CloudStoreConfig<T, Row>
): CloudStore<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
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
    async (next: T[]) => {
      if (!workspaceId || next.length === 0) return;
      const prev = itemsRef.current;
      setItems([...next, ...prev]);
      const rows = next.map(
        (item) => ({ ...config.toRow(item), workspace_id: workspaceId }) as Record<string, unknown>
      );
      const { error } = await supabase.from(config.table).insert(rows);
      if (!error) return;
      if (error.code === UNIQUE_VIOLATION) {
        await reload();
        return;
      }
      setItems(prev);
      setError(error.message);
    },
    [workspaceId, config, reload]
  );

  const add = useCallback((item: T) => insertRows([item]), [insertRows]);
  const addMany = useCallback((next: T[]) => insertRows(next), [insertRows]);

  const update = useCallback(
    async (id: string, patch: Partial<T>) => {
      if (!workspaceId) return;
      const prev = itemsRef.current;
      setItems(prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
      const { error } = await supabase
        .from(config.table)
        .update(config.toRow(patch) as Record<string, unknown>)
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) {
        setItems(prev);
        setError(error.message);
      }
    },
    [workspaceId, config]
  );

  const deleteRows = useCallback(
    async (ids: string[]) => {
      if (!workspaceId || ids.length === 0) return;
      const gone = new Set(ids);
      const prev = itemsRef.current;
      setItems(prev.filter((it) => !gone.has(it.id)));
      const { error } = await supabase
        .from(config.table)
        .delete()
        .in("id", ids)
        .eq("workspace_id", workspaceId);
      if (error) {
        setItems(prev);
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
