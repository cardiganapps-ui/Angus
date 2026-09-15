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
  update: (id: string, patch: Partial<T>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

// Optimistic CRUD over one Supabase table. Every mutation applies locally
// first and restores the prior list if the server rejects it, so the UI
// never shows a half-applied write.
export function useCloudStore<T extends Entity, Row extends { id: string }>(
  userId: string | null,
  config: CloudStoreConfig<T, Row>
): CloudStore<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const reload = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from(config.table)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setItems((data as Row[]).map(config.fromRow));
    setLoading(false);
  }, [userId, config]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  const add = useCallback(
    async (item: T) => {
      const prev = itemsRef.current;
      setItems([item, ...prev]);
      const { error } = await supabase
        .from(config.table)
        .insert(config.toRow(item) as Record<string, unknown>);
      if (error) {
        setItems(prev);
        setError(error.message);
      }
    },
    [config]
  );

  const update = useCallback(
    async (id: string, patch: Partial<T>) => {
      const prev = itemsRef.current;
      setItems(prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
      const { error } = await supabase
        .from(config.table)
        .update(config.toRow(patch) as Record<string, unknown>)
        .eq("id", id);
      if (error) {
        setItems(prev);
        setError(error.message);
      }
    },
    [config]
  );

  const remove = useCallback(
    async (id: string) => {
      const prev = itemsRef.current;
      setItems(prev.filter((it) => it.id !== id));
      const { error } = await supabase.from(config.table).delete().eq("id", id);
      if (error) {
        setItems(prev);
        setError(error.message);
      }
    },
    [config]
  );

  return { items, loading, error, clearError: () => setError(null), reload, add, update, remove };
}
