import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import type {
  Contact,
  Expense,
  Installment,
  Payment,
  Project,
  Sale,
  ScheduleEvent
} from "../types";
import { useCloudStore } from "../hooks/useCloudStore";
import {
  contactStore,
  eventStore,
  expenseStore,
  installmentStore,
  paymentStore,
  projectStore,
  saleStore
} from "../data/rows";
import { importLocalData } from "../lib/importLocal";

interface AppContextValue {
  workspaceId: string;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  /** Re-fetch every store (pull-to-refresh). Never flips `loading`. */
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

  sales: Sale[];
  addSale: (s: Sale) => Promise<void>;
  updateSale: (id: string, patch: Partial<Sale>) => Promise<void>;
  removeSale: (id: string) => Promise<void>;

  payments: Payment[];
  addPayment: (p: Payment) => Promise<void>;
  updatePayment: (id: string, patch: Partial<Payment>) => Promise<void>;
  removePayment: (id: string) => Promise<void>;

  installments: Installment[];
  addInstallment: (i: Installment) => Promise<void>;
  updateInstallment: (id: string, patch: Partial<Installment>) => Promise<void>;
  removeInstallment: (id: string) => Promise<void>;

  expenses: Expense[];
  addExpense: (e: Expense) => Promise<void>;
  updateExpense: (id: string, patch: Partial<Expense>) => Promise<void>;
  removeExpense: (id: string) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

// All data is scoped to one workspace. Mount with `key={workspaceId}` so a
// switch remounts the stores (and shows the skeleton) instead of mixing
// two workspaces' rows in one list.
export function AppProvider({ workspaceId, children }: { workspaceId: string; children: ReactNode }) {
  const projects = useCloudStore(workspaceId, projectStore);
  const contacts = useCloudStore(workspaceId, contactStore);
  const events = useCloudStore(workspaceId, eventStore);
  const sales = useCloudStore(workspaceId, saleStore);
  const payments = useCloudStore(workspaceId, paymentStore);
  const installments = useCloudStore(workspaceId, installmentStore);
  const expenses = useCloudStore(workspaceId, expenseStore);

  const loading =
    projects.loading ||
    contacts.loading ||
    events.loading ||
    sales.loading ||
    payments.loading ||
    installments.loading ||
    expenses.loading;
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
      error:
        projects.error ??
        contacts.error ??
        events.error ??
        sales.error ??
        payments.error ??
        installments.error ??
        expenses.error,
      clearError: () => {
        projects.clearError();
        contacts.clearError();
        events.clearError();
        sales.clearError();
        payments.clearError();
        installments.clearError();
        expenses.clearError();
      },
      refreshAll: async () => {
        await Promise.all([
          projects.reload(),
          contacts.reload(),
          events.reload(),
          sales.reload(),
          payments.reload(),
          installments.reload(),
          expenses.reload()
        ]);
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
      removeEvent: events.remove,
      sales: sales.items,
      addSale: sales.add,
      updateSale: sales.update,
      removeSale: sales.remove,
      payments: payments.items,
      addPayment: payments.add,
      updatePayment: payments.update,
      removePayment: payments.remove,
      installments: installments.items,
      addInstallment: installments.add,
      updateInstallment: installments.update,
      removeInstallment: installments.remove,
      expenses: expenses.items,
      addExpense: expenses.add,
      updateExpense: expenses.update,
      removeExpense: expenses.remove
    }),
    [workspaceId, loading, projects, contacts, events, sales, payments, installments, expenses]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
