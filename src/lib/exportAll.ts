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
   tables no store loads at all (note_versions, workspace_members).

   It is a copy of the ROWS. `documents` and `note_attachments` are
   pointers into R2 — this file carries their metadata, never the image
   bytes, and it says so in `contains` and in the toast. Bundling the
   photos would need a zip writer and a phone able to hold them all in
   memory; the nightly mirror in scripts/backup-db.mjs is what backs up
   the bytes. An export that let her believe her photographs were in it
   would be worse than no export at all. */

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

/** The files this export describes but does not contain. */
export interface FileSummary {
  count: number;
  bytes: number;
}

export interface Backup {
  /** Bumped when the shape changes, so a restore script can branch. */
  format: 2;
  app: string;
  workspaceId: string;
  exportedAt: string;
  /** What is in this file and what is not — read before trusting it. */
  contains: {
    rows: true;
    /** The bytes live in R2; only their rows travel in this file. */
    fileBytes: false;
    files: FileSummary;
    note: string;
  };
  /** Rows per table, keyed by table name. */
  tables: Record<string, unknown[]>;
  /** Tables that could not be read, and why. A partial backup says so. */
  failed: Record<string, string>;
}

const FILES_NOTE =
  "Este archivo contiene tus registros, no tus archivos: las fotos, los PDF y las imágenes de tus notas siguen guardadas en línea y no viajan aquí.";

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

/* Counted from the rows that were actually read, so the number she is
   warned about matches the export in her hand. A `link` document is a
   URL, not bytes, so it is not something the export is missing. */
export function summarizeFiles(tables: Record<string, unknown[]>): FileSummary {
  let count = 0;
  let bytes = 0;
  for (const table of ["documents", "note_attachments"] as const) {
    for (const row of tables[table] ?? []) {
      const r = row as { kind?: string; size_bytes?: number | null };
      if (table === "documents" && r.kind !== "file") continue;
      count += 1;
      bytes += r.size_bytes ?? 0;
    }
  }
  return { count, bytes };
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
  return {
    format: 2,
    app: "angus",
    workspaceId,
    exportedAt,
    contains: { rows: true, fileBytes: false, files: summarizeFiles(tables), note: FILES_NOTE },
    tables,
    failed
  };
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
