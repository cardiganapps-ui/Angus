import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
}

interface WorkspaceRow {
  id: string;
  name: string;
  owner_id: string;
}

const activeKey = (userId: string) => `angus.workspace.${userId}`;

// The workspaces this account can see (RLS: member, or admin sees all).
// The active one is remembered per account; it defaults to the workspace
// the user owns. `ready` is false until the first fetch resolves so the
// data stores don't fire with a null workspace.
export function useWorkspaces(userId: string | null) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setWorkspaces([]);
      setActiveId(null);
      setReady(true);
      return;
    }
    const { data, error } = await supabase.from("workspaces").select("*").order("created_at");
    if (error) {
      setError(error.message);
      setReady(true);
      return;
    }
    const list = (data as WorkspaceRow[]).map((r) => ({ id: r.id, name: r.name, ownerId: r.owner_id }));
    setWorkspaces(list);
    let remembered: string | null = null;
    try {
      remembered = localStorage.getItem(activeKey(userId));
    } catch {
      /* storage unavailable */
    }
    const pick =
      list.find((w) => w.id === remembered) ?? list.find((w) => w.ownerId === userId) ?? list[0] ?? null;
    setActiveId(pick?.id ?? null);
    setReady(true);
  }, [userId]);

  useEffect(() => {
    setReady(false);
    void load();
  }, [load]);

  const setActive = useCallback(
    (id: string) => {
      setActiveId(id);
      if (userId) {
        try {
          localStorage.setItem(activeKey(userId), id);
        } catch {
          /* storage unavailable */
        }
      }
    },
    [userId]
  );

  const active = workspaces.find((w) => w.id === activeId) ?? null;
  return { workspaces, active, ready, error, setActive, reload: load };
}
