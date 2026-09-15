import { useCallback, useState } from "react";

const PREFIX = "angus.";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage full or unavailable — data stays in memory for this session
  }
}

export interface Entity {
  id: string;
}

export function useLocalStore<T extends Entity>(key: string, seed: T[]) {
  const [items, setItems] = useState<T[]>(() => load(key, seed));

  const persist = useCallback(
    (next: T[]) => {
      setItems(next);
      save(key, next);
    },
    [key]
  );

  const add = useCallback(
    (item: T) => {
      persist([item, ...items]);
    },
    [items, persist]
  );

  const update = useCallback(
    (id: string, patch: Partial<T>) => {
      persist(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    },
    [items, persist]
  );

  const remove = useCallback(
    (id: string) => {
      persist(items.filter((item) => item.id !== id));
    },
    [items, persist]
  );

  return { items, add, update, remove };
}
