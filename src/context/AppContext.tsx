import { createContext, useContext, type ReactNode } from "react";
import type { Contact, Project, ScheduleEvent } from "../types";
import { useLocalStore } from "../hooks/useLocalStore";
import { seedContacts, seedEvents, seedProjects } from "../data/seed";

interface AppContextValue {
  projects: Project[];
  addProject: (p: Project) => void;
  updateProject: (id: string, patch: Partial<Project>) => void;
  removeProject: (id: string) => void;

  contacts: Contact[];
  addContact: (c: Contact) => void;
  updateContact: (id: string, patch: Partial<Contact>) => void;
  removeContact: (id: string) => void;

  events: ScheduleEvent[];
  addEvent: (e: ScheduleEvent) => void;
  updateEvent: (id: string, patch: Partial<ScheduleEvent>) => void;
  removeEvent: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const projectStore = useLocalStore<Project>("projects", seedProjects);
  const contactStore = useLocalStore<Contact>("contacts", seedContacts);
  const eventStore = useLocalStore<ScheduleEvent>("events", seedEvents);

  const value: AppContextValue = {
    projects: projectStore.items,
    addProject: projectStore.add,
    updateProject: projectStore.update,
    removeProject: projectStore.remove,

    contacts: contactStore.items,
    addContact: contactStore.add,
    updateContact: contactStore.update,
    removeContact: contactStore.remove,

    events: eventStore.items,
    addEvent: eventStore.add,
    updateEvent: eventStore.update,
    removeEvent: eventStore.remove
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
