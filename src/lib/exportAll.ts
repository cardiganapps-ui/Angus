import { supabase } from "./supabase";

/* ── Descargar todo ──
   Her whole workspace as one JSON file.

   The CSV exports in lib/exportCsv.ts are reports: a period, selected
   columns, resolved names, for an accountant. This is the opposite — it
   is a COPY. Every row of every table she owns, verbatim, so that a lost
   project, a bad migration or a cancelled subscription is recoverable by
   someone holding nothing but this file.

   That is why it reads from the server rather than from AppContext: the
   stores are capped and could be showing her a subset, and a backup of
   a subset is the most dangerous kind of backup. It also covers the
   tables no store loads at all (note_versions, workspace_members). */

/** Every workspace-scoped table, in FK order so a restore can replay it. */
const TABLES = [
  "workspaces",
  "workspace_members",
  "contacts",
  "projects",
  "event_series",
  "events",
  "courses",
  "assignments",
  "class_groups",
  "class_enrollments",
  "attendance",
  "recurring_rules",
  "sales",
  "payments",
  "installments",
  "expenses",
  "notes",
  "note_tags",
  "note_tag_links",
  "note_versions",
  "note_attachments",
  "documents"
] as const;

/** How many tables a complete backup contains. */
export const TABLE_COUNT = TABLES.length;

const PAGE = 1000;

export interface Backup {
  /** Bumped when the shape changes, so a restore script can branch. */
  format: 1;
  app: string;
  workspaceId: string;
  exportedAt: string;
  /** Rows per table, keyed by table name. */
  tables: Record<string, unknown[]>;
  /** Tables that could not be read, and why. A partial backup says so. */
  failed: Record<string, string>;
}

/* `workspaces` and `workspace_members` key on `id` / `workspace_id`;
   every other table has a `workspace_id`. */
function scopeColumn(table: string): string {
  return table === "workspaces" ? "id" : "workspace_id";
}

/** Read one table whole, paging so nothing is silently capped. */
async function readAll(table: string, workspaceId: string): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq(scopeColumn(table), workspaceId)
      .order("id", { ascending: true })
      .range(rows.length, rows.length + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

export async function buildBackup(workspaceId: string, exportedAt: string): Promise<Backup> {
  const tables: Record<string, unknown[]> = {};
  const failed: Record<string, string> = {};
  // Sequential on purpose: 22 parallel reads on a studio connection is
  // how you get a rate limit instead of a backup.
  for (const table of TABLES) {
    try {
      tables[table] = await readAll(table, workspaceId);
    } catch (err) {
      failed[table] = err instanceof Error ? err.message : String(err);
    }
  }
  return { format: 1, app: "angus", workspaceId, exportedAt, tables, failed };
}

export function countRows(backup: Backup): number {
  return Object.values(backup.tables).reduce((n, rows) => n + rows.length, 0);
}

/** Trigger the download. Returns false if the environment can't. */
export function downloadJson(filename: string, payload: unknown): boolean {
  if (typeof document === "undefined" || typeof URL === "undefined") return false;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
