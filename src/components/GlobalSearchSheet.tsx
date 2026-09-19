import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useApp } from "../context/AppContext";
import { useNotes } from "../hooks/useNotes";
import { Sheet } from "./Sheet";
import { Icon, type IconName } from "./Icon";
import { EmptyState } from "./EmptyState";
import {
  MIN_QUERY_LENGTH,
  buildSearchIndex,
  searchAll,
  type SearchEntry,
  type SearchKind
} from "../utils/globalSearch";
import { haptic } from "../lib/haptics";
import { ProjectSheet } from "./ProjectSheet";
import { ContactDetailSheet } from "./ContactDetailSheet";
import { SaleDetailSheet } from "./SaleDetailSheet";
import { ExpenseSheet } from "./ExpenseSheet";
import { EventSheet } from "./EventSheet";
import { CourseDetailSheet } from "./CourseDetailSheet";
import { AssignmentSheet } from "./AssignmentSheet";
import { ClassGroupDetailSheet } from "./ClassGroupDetailSheet";
import { NoteEditor } from "./NoteEditor";

/* ── GlobalSearchSheet ───────────────────────────────────────────────
   One box over her whole studio. Reached from the magnifier in the top
   bar, which is on every screen — so she never has to know WHICH of the
   fourteen destinations a thing lives in before she can find it.

   A sheet, not a desktop command palette: it rises from the bottom, the
   keyboard opens under her thumb, and it dismisses by handle-drag,
   scrim tap, Escape or the X, like every other surface here.

   A result opens the THING, not a summary of it — the same rule Hoy's
   attention list follows. The detail sheet stacks on top of this one
   (the pattern ContactDetailSheet already uses), so closing it comes
   back to the results she was reading.

   Keyboard: ↑ / ↓ walk the results without leaving the text field
   (aria-activedescendant), Enter opens the highlighted one — or the
   first, when she has not moved. Escape closes the sheet. */

const KIND_ICON: Record<SearchKind, IconName> = {
  project: "palette",
  contact: "users",
  sale: "banknote",
  expense: "receipt",
  event: "calendar",
  course: "book",
  assignment: "clipboard",
  note: "edit",
  group: "graduation"
};

const optionId = (i: number) => `gsearch-option-${i}`;

export function GlobalSearchSheet({ onClose }: { onClose: () => void }) {
  const { projects, contacts, sales, expenses, events, courses, assignments, notes, groups } = useApp();
  const { searchNotes, createNote } = useNotes();
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [serverHits, setServerHits] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const [opened, setOpened] = useState<{ kind: SearchKind; id: string } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /* ── What a keystroke costs ──
     The index is built ONCE per corpus (and again only when a store
     changes): one pass over every row, one normalize() per row, which is
     the expensive part — NFD + a diacritic strip over her whole studio.
     A note contributes at most its first 1,200 characters.

     A keystroke then costs: one debounce timer, tokenize() on the query,
     and for each indexed row up to `terms` × indexOf over two strings
     that are ALREADY lowercase and accent-free. No allocation, no
     re-normalization — which is exactly the bug the Notas screen has,
     where normalize() re-runs over every note's full content on every
     letter she types. At 10,000 rows this is a few hundred microseconds;
     the 120 ms debounce below means she pays it once per pause, not once
     per finger-press. */
  const index = useMemo(
    () =>
      buildSearchIndex({ projects, contacts, sales, expenses, events, courses, assignments, notes, groups }),
    [projects, contacts, sales, expenses, events, courses, assignments, notes, groups]
  );

  useEffect(() => {
    const timer = setTimeout(() => setApplied(query), 120);
    return () => clearTimeout(timer);
  }, [query]);

  /* Notes are the one table with real full-text search on the server
     (Spanish stemming, migration 013). Reuse it rather than writing a
     second notes search: its ids join the client results as `boostIds`,
     so "soñar" still finds the note that says "sueños". */
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setServerHits([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      void searchNotes(q).then((hits) => {
        if (alive) setServerHits(hits);
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, searchNotes]);

  const results = useMemo(
    () => searchAll(index, applied, { boostIds: serverHits }),
    [index, applied, serverHits]
  );

  // A new set of results has no highlighted row until she moves.
  useEffect(() => setActive(-1), [results]);

  useEffect(() => {
    if (active < 0) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // She opened this to type: put the caret in the field before the
  // sheet's focus trap parks focus on the panel (it steps aside when
  // something inside already has it).
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }, []);

  const position = useMemo(() => {
    const map = new Map<string, number>();
    results.hits.forEach((hit, i) => map.set(`${hit.kind}-${hit.id}`, i));
    return map;
  }, [results]);

  /* Read the state off the query the RESULTS reflect, not the one her
     finger is still on: judging by the live value flashes "nada coincide"
     for the length of the debounce every time she reaches two letters. */
  const typed = applied.trim();
  const inBox = query.trim();
  const tooShort = typed.length < MIN_QUERY_LENGTH;
  const count = results.total;
  const countText = tooShort
    ? ""
    : count === 0
      ? "Sin resultados"
      : count === results.hits.length
        ? `${count} ${count === 1 ? "resultado" : "resultados"}`
        : `${results.hits.length} de ${count} resultados`;

  function openEntry(entry: SearchEntry) {
    haptic.tap();
    setOpened({ kind: entry.kind, id: entry.id });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const total = results.hits.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (total === 0) return;
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i < 0 ? (step === 1 ? 0 : total - 1) : (i + step + total) % total));
      return;
    }
    if (e.key === "Enter") {
      const hit = results.hits[active >= 0 ? active : 0];
      if (!hit) return;
      e.preventDefault();
      openEntry(hit);
    }
  }

  /* No dead end: what she was looking for isn't here, so keep the words
     she typed instead of making her type them again somewhere else. */
  async function captureAsNote() {
    if (capturing) return;
    setCapturing(true);
    const note = await createNote({ title: inBox || typed });
    setCapturing(false);
    if (note) setOpened({ kind: "note", id: note.id });
  }

  const closeItem = () => setOpened(null);
  const byId = <T extends { id: string }>(list: readonly T[], kind: SearchKind) =>
    opened?.kind === kind ? (list.find((row) => row.id === opened.id) ?? null) : null;
  const openProject = byId(projects, "project");
  const openExpense = byId(expenses, "expense");
  const openEvent = byId(events, "event");
  const openAssignment = byId(assignments, "assignment");
  const openNote = byId(notes, "note");

  return (
    <>
      <Sheet title="Buscar" onClose={onClose}>
        <div className="gsearch">
          <div className="gsearch-bar">
            <label className="sr-only" htmlFor="gsearch-input">
              Buscar en todo Angus
            </label>
            <div className="gsearch-field">
              <Icon name="search" size={18} />
              <input
                id="gsearch-input"
                ref={inputRef}
                type="search"
                role="combobox"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-expanded={results.hits.length > 0}
                aria-controls="gsearch-results"
                aria-autocomplete="list"
                aria-activedescendant={active >= 0 ? optionId(active) : undefined}
                placeholder="Obra, contactos, ingresos, notas…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
              />
              {query && (
                <button
                  type="button"
                  className="search-field-clear"
                  aria-label="Borrar búsqueda"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                >
                  <Icon name="x" size={14} strokeWidth={2.4} />
                </button>
              )}
            </div>
            <div className="gsearch-count" role="status" aria-live="polite">
              {countText}
            </div>
          </div>

          {tooShort ? (
            <EmptyState
              icon="search"
              title="Busca en todo tu estudio"
              body="Una pieza, un contacto, un ingreso, un gasto, algo de tu agenda, un curso, una tarea, una nota o una clase. Escribe dos letras y empieza."
            />
          ) : count === 0 ? (
            <EmptyState
              icon="search"
              title={`Nada coincide con “${typed}”`}
              body="Prueba con una palabra menos, o guárdalo como nota para no perder la idea."
              actionLabel={capturing ? "Creando…" : "Guardar como nota"}
              onAction={captureAsNote}
            />
          ) : (
            <div className="gsearch-results" id="gsearch-results" role="listbox" aria-label="Resultados">
              {results.groups.map((group) => (
                <div className="gsearch-group" key={group.kind} role="group" aria-label={group.label}>
                  <div className="gsearch-group-title eyebrow" aria-hidden="true">
                    {group.label}
                  </div>
                  {group.entries.map((entry) => {
                    const i = position.get(`${entry.kind}-${entry.id}`) ?? -1;
                    const isActive = i >= 0 && i === active;
                    return (
                      <div
                        key={`${entry.kind}-${entry.id}`}
                        id={optionId(i)}
                        role="option"
                        aria-selected={isActive}
                        className={`row-item gsearch-row ${isActive ? "gsearch-row--active" : ""}`}
                        onClick={() => openEntry(entry)}
                      >
                        <span className="gsearch-icon" aria-hidden="true">
                          <Icon name={KIND_ICON[entry.kind]} size={16} />
                        </span>
                        <div className="row-content">
                          <div className="row-title">{entry.title}</div>
                          {entry.subtitle && <div className="row-sub">{entry.subtitle}</div>}
                        </div>
                        {entry.meta && <span className="gsearch-amount">{entry.meta}</span>}
                      </div>
                    );
                  })}
                </div>
              ))}
              {results.hits.length < count && (
                <div className="gsearch-more">
                  Mostrando lo más parecido. Escribe una palabra más para afinar.
                </div>
              )}
            </div>
          )}
        </div>
      </Sheet>

      {opened?.kind === "contact" && <ContactDetailSheet contactId={opened.id} onClose={closeItem} />}
      {opened?.kind === "sale" && <SaleDetailSheet saleId={opened.id} onClose={closeItem} />}
      {opened?.kind === "course" && <CourseDetailSheet courseId={opened.id} onClose={closeItem} />}
      {opened?.kind === "group" && <ClassGroupDetailSheet groupId={opened.id} onClose={closeItem} />}
      {openProject && <ProjectSheet project={openProject} onClose={closeItem} />}
      {openExpense && <ExpenseSheet expense={openExpense} onClose={closeItem} />}
      {openEvent && <EventSheet event={openEvent} onClose={closeItem} />}
      {openAssignment && <AssignmentSheet assignment={openAssignment} onClose={closeItem} />}
      {openNote && <NoteEditor key={openNote.id} note={openNote} onClose={closeItem} />}
    </>
  );
}
