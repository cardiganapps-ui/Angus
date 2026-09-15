import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import type {
  Attendance,
  ClassEnrollment,
  ClassGroup,
  Contact,
  EventSeries,
  Expense,
  Installment,
  Payment,
  Project,
  RecurringRule,
  Sale,
  ScheduleEvent,
  Workspace,
  WorkspaceSettings
} from "../types";
import { useCloudStore } from "../hooks/useCloudStore";
import {
  attendanceStore,
  classEnrollmentStore,
  classGroupStore,
  contactStore,
  eventSeriesStore,
  eventStore,
  expenseStore,
  installmentStore,
  paymentStore,
  projectStore,
  recurringRuleStore,
  saleStore
} from "../data/rows";
import { importLocalData } from "../lib/importLocal";
import { pendingMaterializations } from "../utils/materialize";
import { pendingOccurrences } from "../utils/series";
import { makeId } from "../utils/id";
import { todayISO } from "../utils/dates";

/** What App hands the provider for the active workspace's own row. */
export interface WorkspaceActions {
  updateSettings: (id: string, patch: Partial<WorkspaceSettings>) => Promise<void>;
  renameWorkspace: (id: string, name: string) => Promise<void>;
  markOnboarded: (id: string) => Promise<void>;
  /** A rejected (and reverted) workspace write, surfaced like store errors. */
  error: string | null;
  clearError: () => void;
}

interface AppContextValue {
  workspaceId: string;
  workspace: Workspace;
  settings: WorkspaceSettings;
  updateSettings: (patch: Partial<WorkspaceSettings>) => Promise<void>;
  renameWorkspace: (name: string) => Promise<void>;
  markOnboarded: () => Promise<void>;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  /** Re-fetch every store (pull-to-refresh). Never flips `loading`. */
  refreshAll: () => Promise<void>;

  projects: Project[];
  addProject: (p: Project) => Promise<boolean>;
  updateProject: (id: string, patch: Partial<Project>) => Promise<void>;
  removeProject: (id: string) => Promise<void>;

  contacts: Contact[];
  addContact: (c: Contact) => Promise<boolean>;
  updateContact: (id: string, patch: Partial<Contact>) => Promise<void>;
  removeContact: (id: string) => Promise<void>;

  events: ScheduleEvent[];
  addEvent: (e: ScheduleEvent) => Promise<boolean>;
  addEvents: (rows: ScheduleEvent[]) => Promise<boolean>;
  updateEvent: (id: string, patch: Partial<ScheduleEvent>) => Promise<void>;
  removeEvent: (id: string) => Promise<void>;
  removeEvents: (ids: string[]) => Promise<void>;

  series: EventSeries[];
  addSeries: (s: EventSeries) => Promise<boolean>;
  updateSeries: (id: string, patch: Partial<EventSeries>) => Promise<void>;
  /** Deletes the series AND every occurrence (Postgres cascades; mirrored locally). */
  removeSeries: (id: string) => Promise<void>;

  sales: Sale[];
  addSale: (s: Sale) => Promise<boolean>;
  addSales: (rows: Sale[]) => Promise<boolean>;
  updateSale: (id: string, patch: Partial<Sale>) => Promise<void>;
  removeSale: (id: string) => Promise<void>;

  payments: Payment[];
  addPayment: (p: Payment) => Promise<boolean>;
  updatePayment: (id: string, patch: Partial<Payment>) => Promise<void>;
  removePayment: (id: string) => Promise<void>;

  installments: Installment[];
  addInstallment: (i: Installment) => Promise<boolean>;
  /** A whole plan in one request. */
  addInstallments: (rows: Installment[]) => Promise<boolean>;
  updateInstallment: (id: string, patch: Partial<Installment>) => Promise<void>;
  removeInstallment: (id: string) => Promise<void>;
  removeInstallments: (ids: string[]) => Promise<void>;

  expenses: Expense[];
  addExpense: (e: Expense) => Promise<boolean>;
  addExpenses: (rows: Expense[]) => Promise<boolean>;
  updateExpense: (id: string, patch: Partial<Expense>) => Promise<void>;
  removeExpense: (id: string) => Promise<void>;

  rules: RecurringRule[];
  addRule: (r: RecurringRule) => Promise<boolean>;
  addRules: (rows: RecurringRule[]) => Promise<boolean>;
  updateRule: (id: string, patch: Partial<RecurringRule>) => Promise<void>;
  removeRule: (id: string) => Promise<void>;

  groups: ClassGroup[];
  addGroup: (g: ClassGroup) => Promise<boolean>;
  updateGroup: (id: string, patch: Partial<ClassGroup>) => Promise<void>;
  /** Deletes the group and its enrollments (cascade); its series and rules stay. */
  removeGroup: (id: string) => Promise<void>;

  enrollments: ClassEnrollment[];
  addEnrollment: (e: ClassEnrollment) => Promise<boolean>;
  updateEnrollment: (id: string, patch: Partial<ClassEnrollment>) => Promise<void>;
  removeEnrollment: (id: string) => Promise<void>;

  attendance: Attendance[];
  addAttendance: (rows: Attendance[]) => Promise<boolean>;
  updateAttendance: (id: string, patch: Partial<Attendance>) => Promise<void>;
  removeAttendance: (ids: string[]) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

// All data is scoped to one workspace. Mount with `key={workspaceId}` so a
// switch remounts the stores (and shows the skeleton) instead of mixing
// two workspaces' rows in one list.
export function AppProvider({
  workspace,
  actions,
  children
}: {
  workspace: Workspace;
  actions: WorkspaceActions;
  children: ReactNode;
}) {
  const workspaceId = workspace.id;
  const projects = useCloudStore(workspaceId, projectStore);
  const contacts = useCloudStore(workspaceId, contactStore);
  const events = useCloudStore(workspaceId, eventStore);
  const sales = useCloudStore(workspaceId, saleStore);
  const payments = useCloudStore(workspaceId, paymentStore);
  const installments = useCloudStore(workspaceId, installmentStore);
  const expenses = useCloudStore(workspaceId, expenseStore);
  const rules = useCloudStore(workspaceId, recurringRuleStore);
  const series = useCloudStore(workspaceId, eventSeriesStore);
  const groups = useCloudStore(workspaceId, classGroupStore);
  const enrollments = useCloudStore(workspaceId, classEnrollmentStore);
  const attendance = useCloudStore(workspaceId, attendanceStore);

  const loading =
    projects.loading ||
    contacts.loading ||
    events.loading ||
    sales.loading ||
    payments.loading ||
    installments.loading ||
    expenses.loading ||
    rules.loading ||
    series.loading ||
    groups.loading ||
    enrollments.loading ||
    attendance.loading;

  // Materialize due recurring rules into real rows. Runs once the data
  // is in, and again whenever a rule or its rows change; the unique
  // index on (rule, period) makes a race between two devices harmless.
  const materializing = useRef(false);
  // A batch the server refused (offline, a constraint) is remembered by
  // its shape so the revert doesn't immediately re-trigger the same
  // insert in a loop; the next rule change or pull-to-refresh retries.
  const failedMaterialization = useRef<string | null>(null);
  const ruleItems = rules.items;
  const rulesInflight = rules.inflight;
  const saleItems = sales.items;
  const expenseItems = expenses.items;
  const addSales = sales.addMany;
  const addExpenses = expenses.addMany;
  useEffect(() => {
    // A rule that hasn't landed yet can't be referenced by its rows.
    if (loading || materializing.current || rulesInflight > 0) return;
    const pending = pendingMaterializations(ruleItems, saleItems, expenseItems, todayISO());
    if (pending.sales.length === 0 && pending.expenses.length === 0) return;
    const signature = [...pending.sales, ...pending.expenses]
      .map((r) => `${r.recurringRuleId}:${r.periodKey}`)
      .sort()
      .join("|");
    if (signature === failedMaterialization.current) return;
    materializing.current = true;
    const created = todayISO();
    const jobs: Promise<boolean>[] = [];
    if (pending.sales.length) {
      jobs.push(addSales(pending.sales.map((s) => ({ ...s, id: makeId(), createdAt: created }))));
    }
    if (pending.expenses.length) {
      jobs.push(addExpenses(pending.expenses.map((e) => ({ ...e, id: makeId(), createdAt: created }))));
    }
    void Promise.all(jobs)
      .then((results) => {
        failedMaterialization.current = results.every(Boolean) ? null : signature;
      })
      .finally(() => {
        materializing.current = false;
      });
  }, [loading, rulesInflight, ruleItems, saleItems, expenseItems, addSales, addExpenses]);

  // Same idea for recurring sessions: keep ~12 weeks of occurrences on
  // the calendar. Waits for a just-created series to land (FK).
  const generating = useRef(false);
  const failedGeneration = useRef<string | null>(null);
  const seriesItems = series.items;
  const seriesInflight = series.inflight;
  const eventItems = events.items;
  const addEvents = events.addMany;
  useEffect(() => {
    if (loading || generating.current || seriesInflight > 0) return;
    const pending = pendingOccurrences(seriesItems, eventItems, todayISO());
    if (pending.length === 0) return;
    const signature = pending
      .map((e) => `${e.seriesId}:${e.date}`)
      .sort()
      .join("|");
    if (signature === failedGeneration.current) return;
    generating.current = true;
    const created = todayISO();
    void addEvents(pending.map((e) => ({ ...e, id: makeId(), createdAt: created })))
      .then((ok) => {
        failedGeneration.current = ok ? null : signature;
      })
      .finally(() => {
        generating.current = false;
      });
  }, [loading, seriesInflight, seriesItems, eventItems, addEvents]);
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
      workspace,
      settings: workspace.settings,
      updateSettings: (patch: Partial<WorkspaceSettings>) => actions.updateSettings(workspaceId, patch),
      renameWorkspace: (name: string) => actions.renameWorkspace(workspaceId, name),
      markOnboarded: () => actions.markOnboarded(workspaceId),
      loading,
      error:
        actions.error ??
        projects.error ??
        contacts.error ??
        events.error ??
        sales.error ??
        payments.error ??
        installments.error ??
        expenses.error ??
        rules.error ??
        series.error ??
        groups.error ??
        enrollments.error ??
        attendance.error,
      clearError: () => {
        actions.clearError();
        projects.clearError();
        contacts.clearError();
        events.clearError();
        sales.clearError();
        payments.clearError();
        installments.clearError();
        expenses.clearError();
        rules.clearError();
        series.clearError();
        groups.clearError();
        enrollments.clearError();
        attendance.clearError();
      },
      refreshAll: async () => {
        failedMaterialization.current = null;
        failedGeneration.current = null;
        await Promise.all([
          projects.reload(),
          contacts.reload(),
          events.reload(),
          sales.reload(),
          payments.reload(),
          installments.reload(),
          expenses.reload(),
          rules.reload(),
          series.reload(),
          groups.reload(),
          enrollments.reload(),
          attendance.reload()
        ]);
      },
      projects: projects.items,
      addProject: projects.add,
      updateProject: projects.update,
      removeProject: projects.remove,
      contacts: contacts.items,
      addContact: contacts.add,
      updateContact: contacts.update,
      // A student's tuition rule must stop with them: the FK only nulls
      // contact_id, and an active rule would keep billing a ghost.
      removeContact: async (id: string) => {
        const today = todayISO();
        await Promise.all(
          rules.items
            .filter((r) => r.contactId === id && r.active)
            .map((r) => rules.update(r.id, { active: false, endDate: today }))
        );
        await contacts.remove(id);
        const sessions = new Set(events.items.map((e) => e.id));
        attendance.dropLocal((a) => a.contactId === id && sessions.has(a.eventId));
        enrollments.dropLocal((e) => e.contactId === id);
      },
      events: events.items,
      addEvent: events.add,
      addEvents: events.addMany,
      updateEvent: events.update,
      // Attendance rows cascade with their session; mirror it locally.
      removeEvent: async (id: string) => {
        await events.remove(id);
        attendance.dropLocal((a) => a.eventId === id);
      },
      removeEvents: async (ids: string[]) => {
        await events.removeMany(ids);
        const gone = new Set(ids);
        attendance.dropLocal((a) => gone.has(a.eventId));
      },
      series: series.items,
      addSeries: series.add,
      updateSeries: series.update,
      // Postgres cascades a series' occurrences (and their attendance);
      // mirror it locally.
      removeSeries: async (id: string) => {
        const sessionIds = new Set(events.items.filter((e) => e.seriesId === id).map((e) => e.id));
        await series.remove(id);
        events.dropLocal((e) => e.seriesId === id);
        attendance.dropLocal((a) => sessionIds.has(a.eventId));
      },
      sales: sales.items,
      addSale: sales.add,
      addSales: sales.addMany,
      updateSale: sales.update,
      // Postgres cascades a sale's payments and installments; mirror that
      // locally so no balance is ever derived from orphaned rows.
      removeSale: async (id: string) => {
        await sales.remove(id);
        payments.dropLocal((p) => p.saleId === id);
        installments.dropLocal((i) => i.saleId === id);
      },
      payments: payments.items,
      addPayment: payments.add,
      updatePayment: payments.update,
      removePayment: payments.remove,
      installments: installments.items,
      addInstallment: installments.add,
      addInstallments: installments.addMany,
      updateInstallment: installments.update,
      removeInstallment: installments.remove,
      removeInstallments: installments.removeMany,
      expenses: expenses.items,
      addExpense: expenses.add,
      addExpenses: expenses.addMany,
      updateExpense: expenses.update,
      removeExpense: expenses.remove,
      rules: rules.items,
      addRule: rules.add,
      addRules: rules.addMany,
      updateRule: rules.update,
      removeRule: rules.remove,
      groups: groups.items,
      addGroup: groups.add,
      updateGroup: groups.update,
      // Deleting a class ends its students' tuition rules (the FK only
      // nulls group_id) so no "Colegiatura" keeps materializing for it.
      removeGroup: async (id: string) => {
        const today = todayISO();
        await Promise.all(
          rules.items
            .filter((r) => r.groupId === id && r.active)
            .map((r) => rules.update(r.id, { active: false, endDate: today }))
        );
        await groups.remove(id);
        enrollments.dropLocal((e) => e.groupId === id);
      },
      enrollments: enrollments.items,
      addEnrollment: enrollments.add,
      updateEnrollment: enrollments.update,
      removeEnrollment: enrollments.remove,
      attendance: attendance.items,
      addAttendance: attendance.addMany,
      updateAttendance: attendance.update,
      removeAttendance: attendance.removeMany
    }),
    [
      workspaceId,
      workspace,
      actions,
      loading,
      projects,
      contacts,
      events,
      sales,
      payments,
      installments,
      expenses,
      rules,
      series,
      groups,
      enrollments,
      attendance
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
