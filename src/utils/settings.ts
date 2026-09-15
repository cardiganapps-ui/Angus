import type {
  ExpenseCategory,
  PaymentMethod,
  Practice,
  QuickAction,
  TextScale,
  ThemePreference,
  WorkspaceSettings
} from "../types";
import type { InstallmentFrequency } from "./accounting";
import { EXPENSE_CATEGORY } from "../data/constants";

/* ── Workspace settings ──
   The jsonb blob on `workspaces.settings` is written by whichever client
   version last saved it. Reading it therefore has to be forgiving: every
   key defaults, every value is type-checked, unknown keys are dropped.
   The result is always a complete, well-typed WorkspaceSettings. */

export const PRACTICES: Practice[] = [
  "pieces",
  "commissions",
  "classes",
  "workshops",
  "studies",
  "expos",
  "murals",
  "illustration",
  "other"
];

export const QUICK_ACTIONS: QuickAction[] = ["sale", "expense", "event", "project", "contact"];

const PAYMENT_METHODS: PaymentMethod[] = ["cash", "transfer", "card", "other"];
const FREQUENCIES: InstallmentFrequency[] = ["monthly", "biweekly"];
const THEMES: ThemePreference[] = ["light", "dark", "system"];
const TEXT_SCALES: TextScale[] = ["sm", "md", "lg"];
const EXPENSE_CATEGORIES: ExpenseCategory[] = EXPENSE_CATEGORY.map((c) => c.value);

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  artistName: "",
  practice: [],
  mediums: [],
  monthlyIncomeGoal: null,
  defaultPaymentMethod: "transfer",
  defaultDepositPercent: 50,
  defaultInstallmentFrequency: "monthly",
  budgets: {},
  theme: "system",
  textScale: "md",
  quickActions: [...QUICK_ACTIONS]
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function listOf<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<T>();
  for (const v of value) {
    if (typeof v === "string" && (allowed as readonly string[]).includes(v)) seen.add(v as T);
  }
  return [...seen];
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const v of value) {
    if (typeof v === "string" && v.trim()) seen.add(v.trim());
  }
  return [...seen];
}

function money(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function percent(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 100
    ? Math.round(value)
    : fallback;
}

/** Normalize whatever is in the row into a complete WorkspaceSettings. */
export function mergeSettings(raw: unknown): WorkspaceSettings {
  const r = isRecord(raw) ? raw : {};
  const budgets: Partial<Record<ExpenseCategory, number>> = {};
  if (isRecord(r.budgets)) {
    for (const category of EXPENSE_CATEGORIES) {
      const limit = money(r.budgets[category]);
      if (limit !== null) budgets[category] = limit;
    }
  }
  const quick = listOf(r.quickActions, QUICK_ACTIONS);
  return {
    artistName: typeof r.artistName === "string" ? r.artistName.trim() : "",
    practice: listOf(r.practice, PRACTICES),
    mediums: stringList(r.mediums),
    monthlyIncomeGoal: money(r.monthlyIncomeGoal),
    defaultPaymentMethod: oneOf(r.defaultPaymentMethod, PAYMENT_METHODS, "transfer"),
    defaultDepositPercent: percent(r.defaultDepositPercent, 50),
    defaultInstallmentFrequency: oneOf(r.defaultInstallmentFrequency, FREQUENCIES, "monthly"),
    budgets,
    theme: oneOf(r.theme, THEMES, "system"),
    textScale: oneOf(r.textScale, TEXT_SCALES, "md"),
    quickActions: quick.length > 0 ? quick : [...QUICK_ACTIONS]
  };
}

/** First name only, for greetings — "Andrea Garza" → "Andrea". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** Distinct mediums already used on pieces, most frequent first. */
export function suggestMediums(projects: { medium: string }[]): string[] {
  const counts = new Map<string, number>();
  for (const p of projects) {
    const m = p.medium.trim();
    if (!m) continue;
    const key = m.charAt(0).toUpperCase() + m.slice(1);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([m]) => m);
}
