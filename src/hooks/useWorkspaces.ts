import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Workspace, WorkspaceSettings } from "../types";
import { mergeSettings } from "../utils/settings";

export type { Workspace } from "../types";

interface WorkspaceRow {
  id: string;
  name: string;
  owner_id: string;
  settings: unknown;
  onboarded_at: string | null;
}

const activeKey = (userId: string) => `angus.workspace.${userId}`;

const fromRow = (r: WorkspaceRow): Workspace => ({
  id: r.id,
  name: r.name,
  ownerId: r.owner_id,
  settings: mergeSettings(r.settings),
  onboardedAt: r.onboarded_at
});

// The workspaces this account can see (RLS: member, or admin sees all).
// The active one is remembered per account; it defaults to the workspace
// the user owns. `ready` is false until the first fetch resolves so the
// data stores don't fire with a null workspace.
//
// Writes (rename, settings, onboarding marker) follow the same optimistic
// + revert contract as useCloudStore: apply locally, send, restore the
// prior list and surface the error if the server says no.
export function useWorkspaces(userId: string | null) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef(workspaces);
  listRef.current = workspaces;

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
    const list = (data as WorkspaceRow[]).map(fromRow);
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

  const patchWorkspace = useCallback(
    async (id: string, local: Partial<Workspace>, row: Record<string, unknown>) => {
      const prev = listRef.current;
      setWorkspaces(prev.map((w) => (w.id === id ? { ...w, ...local } : w)));
      const { error } = await supabase.from("workspaces").update(row).eq("id", id);
      if (error) {
        setWorkspaces(prev);
        setError(error.message);
      }
    },
    []
  );

  const updateSettings = useCallback(
    (id: string, patch: Partial<WorkspaceSettings>) => {
      const current = listRef.current.find((w) => w.id === id);
      if (!current) return Promise.resolve();
      // Send the WHOLE normalized blob, never a partial jsonb patch: the
      // row is the source of truth and a merge on the server would need
      // its own schema knowledge.
      const settings = mergeSettings({ ...current.settings, ...patch });
      return patchWorkspace(id, { settings }, { settings });
    },
    [patchWorkspace]
  );

  const renameWorkspace = useCallback(
    (id: string, name: string) => patchWorkspace(id, { name }, { name }),
    [patchWorkspace]
  );

  const markOnboarded = useCallback(
    (id: string) => {
      const at = new Date().toISOString();
      return patchWorkspace(id, { onboardedAt: at }, { onboarded_at: at });
    },
    [patchWorkspace]
  );

  const clearError = useCallback(() => setError(null), []);

  const active = workspaces.find((w) => w.id === activeId) ?? null;
  return {
    workspaces,
    active,
    ready,
    error,
    clearError,
    setActive,
    reload: load,
    updateSettings,
    renameWorkspace,
    markOnboarded
  };
}
