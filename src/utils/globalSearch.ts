import type {
  Assignment,
  ClassGroup,
  Contact,
  Course,
  Expense,
  Note,
  Project,
  Sale,
  ScheduleEvent
} from "../types";
import {
  ASSIGNMENT_STATUS,
  AVAILABILITY,
  CONTACT_RELATIONSHIP,
  COURSE_KIND,
  COURSE_STATUS,
  EVENT_KIND,
  EXPENSE_CATEGORY,
  INCOME_CATEGORY,
  LEAD_STAGE,
  PROJECT_STATUS,
  SALE_STATUS,
  labelFor
} from "../data/constants";
import { formatShort } from "./dates";
import { formatMXNShort } from "./money";
import { normalize, tokenize } from "./noteSearch";
import { notePreview } from "./noteText";

/* ── Global search ───────────────────────────────────────────────────
   One query over everything she has ever written down: obra, contactos,
   ventas, gastos, agenda, cursos, tareas, notas y clases.

   Two halves, on purpose:

     buildSearchIndex()  runs ONCE per corpus (memoized by the caller) and
                         pays the whole normalization cost up front —
                         every row becomes a SearchEntry whose title and
                         text are already lowercase and accent-stripped.

     searchAll()         runs per (debounced) keystroke and only walks
                         that array doing indexOf on strings that are
                         ALREADY normalized. Nothing is allocated per row
                         and nothing is re-normalized. Notes.tsx re-ran
                         normalize() over every note's full content on
                         every keystroke; this is the shape that avoids it.

   Spanish: normalize() (shared with noteSearch.ts) strips diacritics via
   NFD, so "cafe" finds "Café" and "sueno" finds "sueño". Multi-word
   queries are AND — every term has to land somewhere in the row.

   Ranking, highest first: the query IS the title, the title starts with
   the term, a word of the title starts with it, the title contains it,
   a word of the secondary text starts with it, the text contains it.
   Ties break by recency, then alphabetically, so the order is stable
   (and testable) rather than dependent on store order. */

export type SearchKind =
  | "project"
  | "contact"
  | "sale"
  | "expense"
  | "event"
  | "course"
  | "assignment"
  | "note"
  | "group";

/** Group headings — the same words the drawer and the tabs use. */
export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  project: "Obra",
  contact: "Contactos",
  sale: "Ventas",
  expense: "Gastos",
  event: "Agenda",
  course: "Estudios",
  assignment: "Tareas",
  note: "Notas",
  group: "Clases"
};

export interface SearchEntry {
  kind: SearchKind;
  id: string;
  /** What she reads first — the row's own name. */
  title: string;
  /** The second line: state, date, who it belongs to. */
  subtitle: string;
  /** Right-hand column: money, already formatted. Empty when there is none. */
  meta: string;
  /** ISO date used only to break ties; "" when the row has none. */
  date: string;
  /** Normalized `title`. */
  nTitle: string;
  /** Normalized subtitle + body (notes, description, content…). */
  nText: string;
}

export interface SearchGroup {
  kind: SearchKind;
  label: string;
  entries: SearchEntry[];
}

export interface SearchResults {
  /** Capped, in rank order. */
  hits: SearchEntry[];
  /** The same hits grouped by kind; groups ordered by their best hit. */
  groups: SearchGroup[];
  /** How many rows matched BEFORE the caps — what the count line says. */
  total: number;
}

/** Below this a query is noise, not a search. */
export const MIN_QUERY_LENGTH = 2;

const DEFAULT_LIMIT = 30;
const DEFAULT_PER_KIND = 5;

/* A note can be thousands of words. Indexing all of them would make the
   one-off build cost scale with how much she writes, for matches she
   would never scroll to anyway — and the Postgres `search_notes` RPC
   (Spanish stemming, whole column) already covers the deep end: pass its
   ids as `boostIds` and they join the results. */
const BODY_CHARS = 1200;

const WORD_CHAR = /[\p{L}\p{N}]/u;

const TITLE_EXACT = 200;
const TITLE_PREFIX = 120;
const TITLE_WORD = 80;
const TITLE_ANY = 50;
const TEXT_WORD = 24;
const TEXT_ANY = 12;

function isWordStart(hay: string, at: number): boolean {
  return at === 0 || !WORD_CHAR.test(hay[at - 1]);
}

/* Best score `term` can get out of one already-normalized field. Walks
   later occurrences only while it might upgrade "contains" to "starts a
   word", so the scan is bounded by how often the term repeats. */
function fieldScore(hay: string, term: string, prefix: number, word: number, any: number): number {
  const first = hay.indexOf(term);
  if (first < 0) return 0;
  if (first === 0) return prefix;
  for (let at = first; at >= 0; at = hay.indexOf(term, at + 1)) {
    if (isWordStart(hay, at)) return word;
  }
  return any;
}

function entryScore(entry: SearchEntry, terms: string[]): number {
  let total = 0;
  for (const term of terms) {
    const inTitle = fieldScore(entry.nTitle, term, TITLE_PREFIX, TITLE_WORD, TITLE_ANY);
    const score = inTitle > 0 ? inTitle : fieldScore(entry.nText, term, TEXT_WORD, TEXT_WORD, TEXT_ANY);
    // AND: one term nowhere in the row disqualifies it.
    if (score === 0) return 0;
    total += score;
  }
  if (entry.nTitle === terms.join(" ")) total += TITLE_EXACT;
  return total;
}

export interface SearchOptions {
  /** Hard cap on rows returned (default 30). */
  limit?: number;
  /** Cap per kind, so one busy table can't push out the others (default 5). */
  perKind?: number;
  /** Ids the server found (notes FTS) that the client match may have missed. */
  boostIds?: readonly string[];
}

/** Match, rank and cap. Pure: same entries + same query → same order. */
export function searchAll(
  entries: readonly SearchEntry[],
  query: string,
  options: SearchOptions = {}
): SearchResults {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const perKind = options.perKind ?? DEFAULT_PER_KIND;
  const boost = options.boostIds && options.boostIds.length ? new Set(options.boostIds) : null;
  const terms = tokenize(query);
  const long = terms.join("").length >= MIN_QUERY_LENGTH;
  if (terms.length === 0 || !long) return { hits: [], groups: [], total: 0 };

  const scored: { entry: SearchEntry; score: number }[] = [];
  for (const entry of entries) {
    let score = entryScore(entry, terms);
    // A server hit the client couldn't see (stemming: "sueños" ← "sueño")
    // still belongs in the list, at the bottom of it.
    if (score === 0 && boost?.has(entry.id)) score = TEXT_ANY;
    if (score > 0) scored.push({ entry, score });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.entry.date.localeCompare(a.entry.date) ||
      a.entry.title.localeCompare(b.entry.title, "es") ||
      a.entry.id.localeCompare(b.entry.id)
  );

  const perKindCount = new Map<SearchKind, number>();
  const hits: SearchEntry[] = [];
  for (const { entry } of scored) {
    if (hits.length >= limit) break;
    const used = perKindCount.get(entry.kind) ?? 0;
    if (used >= perKind) continue;
    perKindCount.set(entry.kind, used + 1);
    hits.push(entry);
  }

  // Insertion order = best hit first, so the group she meant leads.
  const byKind = new Map<SearchKind, SearchEntry[]>();
  for (const hit of hits) {
    const list = byKind.get(hit.kind);
    if (list) list.push(hit);
    else byKind.set(hit.kind, [hit]);
  }
  const groups: SearchGroup[] = [...byKind].map(([kind, list]) => ({
    kind,
    label: SEARCH_KIND_LABEL[kind],
    entries: list
  }));

  return { hits, groups, total: scored.length };
}

/* ── The index ─────────────────────────────────────────────────────── */

export interface SearchCorpus {
  projects: readonly Project[];
  contacts: readonly Contact[];
  sales: readonly Sale[];
  expenses: readonly Expense[];
  events: readonly ScheduleEvent[];
  courses: readonly Course[];
  assignments: readonly Assignment[];
  notes: readonly Note[];
  groups: readonly ClassGroup[];
}

const join = (parts: (string | number | null | undefined | false)[]): string =>
  parts.filter((p) => p !== null && p !== undefined && p !== false && p !== "").join(" · ");

function makeEntry(
  kind: SearchKind,
  id: string,
  title: string,
  subtitle: string,
  meta: string,
  date: string,
  body: string
): SearchEntry {
  return {
    kind,
    id,
    title,
    subtitle,
    meta,
    date,
    nTitle: normalize(title),
    nText: normalize(`${subtitle} ${body}`)
  };
}

/** Flatten the whole workspace into one searchable array. O(rows), once. */
export function buildSearchIndex(corpus: SearchCorpus): SearchEntry[] {
  const contactName = new Map(corpus.contacts.map((c) => [c.id, c.name]));
  const projectTitle = new Map(corpus.projects.map((p) => [p.id, p.title]));
  const courseName = new Map(corpus.courses.map((c) => [c.id, c.name]));
  const name = (id: string | null) => (id ? (contactName.get(id) ?? "") : "");

  const entries: SearchEntry[] = [];

  for (const p of corpus.projects) {
    entries.push(
      makeEntry(
        "project",
        p.id,
        p.title,
        join([labelFor(PROJECT_STATUS, p.status), p.medium, name(p.contactId)]),
        p.price !== null ? formatMXNShort(p.price) : "",
        p.createdAt,
        join([
          labelFor(AVAILABILITY, p.availability),
          p.location,
          p.edition,
          p.dimensions,
          p.year,
          p.courseId ? (courseName.get(p.courseId) ?? "") : "",
          p.notes
        ])
      )
    );
  }

  for (const c of corpus.contacts) {
    entries.push(
      makeEntry(
        "contact",
        c.id,
        c.name,
        join([
          labelFor(CONTACT_RELATIONSHIP, c.relationship),
          c.leadStage ? labelFor(LEAD_STAGE, c.leadStage) : "",
          c.email || c.phone
        ]),
        "",
        c.createdAt,
        join([c.email, c.phone, c.notes])
      )
    );
  }

  for (const s of corpus.sales) {
    entries.push(
      makeEntry(
        "sale",
        s.id,
        s.title,
        join([labelFor(SALE_STATUS, s.status), formatShort(s.date), name(s.contactId)]),
        formatMXNShort(s.amount),
        s.date,
        join([
          labelFor(INCOME_CATEGORY, s.category),
          s.projectId ? (projectTitle.get(s.projectId) ?? "") : "",
          s.notes
        ])
      )
    );
  }

  for (const e of corpus.expenses) {
    entries.push(
      makeEntry(
        "expense",
        e.id,
        e.title,
        join([labelFor(EXPENSE_CATEGORY, e.category), formatShort(e.date)]),
        formatMXNShort(e.amount),
        e.date,
        join([
          e.projectId ? (projectTitle.get(e.projectId) ?? "") : "",
          e.courseId ? (courseName.get(e.courseId) ?? "") : "",
          e.notes
        ])
      )
    );
  }

  // A cancelled occurrence is kept in the table so it never regenerates;
  // it is hidden everywhere else, so it must not surface here either.
  for (const e of corpus.events) {
    if (e.cancelled) continue;
    entries.push(
      makeEntry(
        "event",
        e.id,
        e.title,
        join([labelFor(EVENT_KIND, e.kind), formatShort(e.date), e.startTime ?? "", e.location]),
        "",
        e.date,
        join([name(e.contactId), e.courseId ? (courseName.get(e.courseId) ?? "") : "", e.notes])
      )
    );
  }

  for (const c of corpus.courses) {
    entries.push(
      makeEntry(
        "course",
        c.id,
        c.name,
        join([labelFor(COURSE_KIND, c.kind), labelFor(COURSE_STATUS, c.status), c.institution]),
        "",
        c.startDate ?? c.createdAt,
        join([c.location, name(c.teacherContactId), c.notes])
      )
    );
  }

  for (const a of corpus.assignments) {
    entries.push(
      makeEntry(
        "assignment",
        a.id,
        a.title,
        join([
          labelFor(ASSIGNMENT_STATUS, a.status),
          courseName.get(a.courseId) ?? "",
          a.dueDate ? `Entrega ${formatShort(a.dueDate)}` : ""
        ]),
        "",
        a.dueDate ?? a.createdAt,
        join([a.description.slice(0, BODY_CHARS), a.grade, a.feedback])
      )
    );
  }

  for (const n of corpus.notes) {
    entries.push(
      makeEntry(
        "note",
        n.id,
        n.title || "Sin título",
        // notePreview walks every line; hand it only what a preview can show.
        notePreview(n.content.slice(0, 400), 70),
        "",
        n.updatedAt,
        n.content.slice(0, BODY_CHARS)
      )
    );
  }

  for (const g of corpus.groups) {
    entries.push(
      makeEntry(
        "group",
        g.id,
        g.name,
        join([g.active ? "Clase activa" : "Clase cerrada", g.location]),
        g.tuitionAmount !== null ? formatMXNShort(g.tuitionAmount) : "",
        g.createdAt,
        g.notes
      )
    );
  }

  return entries;
}
