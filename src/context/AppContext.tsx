import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import type { Contact, Project, ScheduleEvent } from "../types";
import { useCloudStore } from "../hooks/useCloudStore";
import { contactStore, eventStore, projectStore } from "../data/rows";
import { importLocalData } from "../lib/importLocal";

interface AppContextValue {
  workspaceId: string;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  /** Re-fetch all three stores (pull-to-refresh). Never flips `loading`. */
  refreshAll: () => Promise<void>;

  projects: Project[];
  addProject: (p: Project) => Promise<void>;
  updateProject: (id: string, patch: Partial<Project>) => Promise<void>;
  removeProject: (id: string) => Promise<void>;

  contacts: Contact[];
  addContact: (c: Contact) => Promise<void>;
  updateContact: (id: string, patch: Partial<Contact>) => Promise<void>;
  removeContact: (id: string) => Promise<void>;

  events: ScheduleEvent[];
  addEvent: (e: ScheduleEvent) => Promise<void>;
  updateEvent: (id: string, patch: Partial<ScheduleEvent>) => Promise<void>;
  removeEvent: (id: string) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

// All data is scoped to one workspace. Mount with `key={workspaceId}` so a
// switch remounts the stores (and shows the skeleton) instead of mixing
// two workspaces' rows in one list.
export function AppProvider({ workspaceId, children }: { workspaceId: string; children: ReactNode }) {
  const projects = useCloudStore(workspaceId, projectStore);
  const contacts = useCloudStore(workspaceId, contactStore);
  const events = useCloudStore(workspaceId, eventStore);

  const loading = projects.loading || contacts.loading || events.loading;
  const importedFor = useRef<string | null>(null);

  useEffect(() => {
    if (loading || importedFor.current === workspaceId) return;
    importedFor.current = workspaceId;
    if (projects.items.length + contacts.items.length + events.items.length > 0) return;
    importLocalData(workspaceId)
      .then((imported) => {
        if (imported) return Promise.all([contacts.reload(), projects.reload(), events.reload()]);
      })
      .catch(() => {
        importedFor.current = null;
      });
  }, [loading, workspaceId, projects, contacts, events]);

  const value = useMemo<AppContextValue>(
    () => ({
      workspaceId,
      loading,
      error: projects.error ?? contacts.error ?? events.error,
      clearError: () => {
        projects.clearError();
        contacts.clearError();
        events.clearError();
      },
      refreshAll: async () => {
        await Promise.all([projects.reload(), contacts.reload(), events.reload()]);
      },
      projects: projects.items,
      addProject: projects.add,
      updateProject: projects.update,
      removeProject: projects.remove,
      contacts: contacts.items,
      addContact: contacts.add,
      updateContact: contacts.update,
      removeContact: contacts.remove,
      events: events.items,
      addEvent: events.add,
      updateEvent: events.update,
      removeEvent: events.remove
    }),
    [workspaceId, loading, projects, contacts, events]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
