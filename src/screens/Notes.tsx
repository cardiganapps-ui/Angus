import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import { useNotes, type NoteLinks } from "../hooks/useNotes";
import type { Note } from "../types";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { SearchField } from "../components/SearchField";
import { Sheet } from "../components/Sheet";
import { NoteEditor } from "../components/NoteEditor";
import { QuickCaptureSheet } from "../components/notes/QuickCaptureSheet";
import { TagFilterPills } from "../components/notes/TagFilterPills";
import { NoteTagPicker } from "../components/notes/NoteTagPicker";
import { NoteLinkFields } from "../components/notes/NoteLinkFields";
import { describeNoteLinks, useNoteLinkLookup } from "../hooks/useNoteLinkLookup";
import { groupNotesByRecency } from "../utils/noteGrouping";
import { matches, tokenize } from "../utils/noteSearch";
import { notePreview, relativeTime } from "../utils/noteText";
import { haptic } from "../lib/haptics";

type Filter = "all" | "pinned" | "inbox";

/* ── Notas ──
   Every note she has, newest first, with pinned ones on top: search
   (client match plus server full-text once the query is long enough),
   tag filters (AND), Fijadas / Inbox, select mode for bulk delete, a
   long-press properties sheet, and a FAB that captures a thought in
   two fields. Tapping a row opens the editor out of that row. */
export function Notes() {
  const { courses } = useApp();
  const { notes, noteTags, noteTagLinks, tagsByNote, deleteNotes, deleteNote, togglePin, linkNote, upsertTag, linkTag, unlinkTag, searchNotes } = useNotes();
  const lookup = useNoteLinkLookup();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [serverHits, setServerHits] = useState<string[]>([]);
  const [editing, setEditing] = useState<Note | null>(null);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [propsNote, setPropsNote] = useState<Note | null>(null);
  const [longPressingId, setLongPressingId] = useState<string | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | "fired" | null>(null);

  // Server-side stemming finds "sueños" for "sueño"; the client match
  // stays instant. Both apply once the query is long enough.
  useEffect(() => {
    const q = search.trim();
    if (q.length < 3) {
      setServerHits([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      void searchNotes(q).then((ids) => {
        if (alive) setServerHits(ids);
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [search, searchNotes]);

  const filtered = useMemo(() => {
    const terms = tokenize(search);
    const hits = new Set(serverHits);
    let list = notes.filter((n) => {
      const course = n.courseId ? courses.find((c) => c.id === n.courseId) : null;
      return matches(n, course ? { name: course.name } : null, terms) || hits.has(n.id);
    });
    if (filter === "pinned") list = list.filter((n) => n.pinned);
    if (filter === "inbox") list = list.filter((n) => !n.courseId && !n.eventId && !n.assignmentId && !n.projectId && !tagsByNote.get(n.id));
    if (selectedTagIds.length > 0) {
      list = list.filter((n) => {
        const own = tagsByNote.get(n.id);
        return !!own && selectedTagIds.every((id) => own.has(id));
      });
    }
    return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  }, [notes, search, serverHits, filter, selectedTagIds, tagsByNote, courses]);

  const groups = useMemo(() => groupNotesByRecency(filtered), [filtered]);
  const inboxCount = useMemo(
    () => notes.filter((n) => !n.courseId && !n.eventId && !n.assignmentId && !n.projectId && !tagsByNote.get(n.id)).length,
    [notes, tagsByNote]
  );
  const pinnedCount = notes.filter((n) => n.pinned).length;

  const openNote = (note: Note, ev?: React.MouseEvent) => {
    if (longPressRef.current === "fired") {
      longPressRef.current = null;
      return;
    }
    cancelLongPress();
    if (selectMode) {
      toggleSelect(note.id);
      return;
    }
    haptic.tap();
    setOriginRect(ev?.currentTarget?.getBoundingClientRect?.() ?? null);
    setEditing(note);
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const startLongPress = (note: Note) => {
    setLongPressingId(note.id);
    longPressRef.current = setTimeout(() => {
      longPressRef.current = "fired";
      setLongPressingId(null);
      haptic.tap();
      setPropsNote(note);
    }, 500);
  };
  const cancelLongPress = () => {
    if (longPressRef.current && longPressRef.current !== "fired") clearTimeout(longPressRef.current);
    if (longPressRef.current !== "fired") longPressRef.current = null;
    setLongPressingId(null);
  };

  const livePropsNote = propsNote ? (notes.find((n) => n.id === propsNote.id) ?? null) : null;
  const linkLabel = (n: Note) => describeNoteLinks(n, lookup).join(" · ");

  let rowIndex = 0;

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">
          {notes.length} {notes.length === 1 ? "nota" : "notas"}
          {inboxCount > 0 ? ` · ${inboxCount} sin archivar` : ""}
        </div>
        <h1 className="page-title">Notas</h1>
      </div>

      {notes.length > 0 && (
        <>
          <SearchField value={search} onChange={setSearch} placeholder="Buscar en tus notas…" ariaLabel="Buscar notas" />
          <div className="filter-row" role="group" aria-label="Filtrar notas">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>Todas</FilterChip>
            <FilterChip active={filter === "pinned"} onClick={() => setFilter("pinned")}>
              <Icon name="star" size={12} strokeWidth={2.4} /> Fijadas{pinnedCount ? ` ${pinnedCount}` : ""}
            </FilterChip>
            <FilterChip active={filter === "inbox"} onClick={() => setFilter("inbox")}>Inbox{inboxCount ? ` ${inboxCount}` : ""}</FilterChip>
          </div>
          <TagFilterPills tags={noteTags} tagLinks={noteTagLinks} selectedIds={selectedTagIds} onToggle={(id) => setSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))} />
        </>
      )}

      {notes.length === 0 ? (
        <div className="section">
          <div className="card">
            <EmptyState
              icon="edit"
              title="Sin notas todavía"
              body="Apuntes de clase, críticas que recibiste, la bitácora de una pieza. Toca + para escribir la primera; después puedes ligarla a un curso o a una tarea."
            />
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="section">
          <div className="card">
            <EmptyState
              icon="search"
              title={filter === "inbox" ? "Inbox vacío" : "Nada coincide"}
              body={filter === "inbox" ? "Todo lo que escribes está ligado a algo o etiquetado. Bien." : "Prueba con otra palabra o quita los filtros."}
            />
          </div>
        </div>
      ) : (
        <div className="section">
          <div className="section-header">
            <span className="section-title">{filtered.length === notes.length ? "Todas" : `${filtered.length} ${filtered.length === 1 ? "nota" : "notas"}`}</span>
            {selectMode ? (
              <button
                type="button"
                className="see-all btn-tap"
                onClick={() => {
                  setSelectMode(false);
                  setSelected(new Set());
                }}
              >
                Listo
              </button>
            ) : (
              <button type="button" className="see-all btn-tap" onClick={() => setSelectMode(true)}>
                Seleccionar
              </button>
            )}
          </div>
          <div className="notes-groups">
            {groups.map((g) => (
              <div key={g.key} className="notes-group">
                <div className="notes-group-header">{g.label}</div>
                {(g.notes as Note[]).map((n) => {
                  const i = rowIndex++;
                  const isSelected = selected.has(n.id);
                  const pressing = longPressingId === n.id;
                  const link = linkLabel(n);
                  const accent = n.pinned ? "var(--amber)" : link ? "var(--accent-light)" : "transparent";
                  return (
                    <div
                      key={n.id}
                      className={"note-card-row list-entry-stagger" + (pressing ? " note-card-pressing" : "") + (n.pinned ? " is-pinned" : "")}
                      style={{ "--stagger-i": Math.min(i, 12), "--note-row-accent": accent } as CSSProperties}
                    >
                      <div className="note-card-inner">
                        {selectMode && (
                          <button
                            type="button"
                            className="task-check-btn"
                            role="checkbox"
                            aria-checked={isSelected}
                            aria-label={isSelected ? "Quitar de la selección" : "Seleccionar"}
                            onClick={() => toggleSelect(n.id)}
                          >
                            <span className={`task-check ${isSelected ? "task-check--done" : ""}`}>
                              <Icon name="check" size={14} strokeWidth={3} />
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="note-card btn-tap"
                          onClick={(ev) => openNote(n, ev)}
                          onTouchStart={() => !selectMode && startLongPress(n)}
                          onTouchEnd={cancelLongPress}
                          onTouchMove={cancelLongPress}
                          onTouchCancel={cancelLongPress}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setPropsNote(n);
                          }}
                        >
                          <div className="note-card-head">
                            {n.pinned && (
                              <span className="note-card-pin" aria-label="Fijada">
                                <Icon name="star" size={11} strokeWidth={2.6} />
                              </span>
                            )}
                            <span className="note-card-title">{n.title || "Sin título"}</span>
                            <span className="note-card-time">{relativeTime(n.updatedAt)}</span>
                          </div>
                          <div className={"note-card-sub" + (link ? " is-linked" : "")}>{link || notePreview(n.content) || "Sin contenido"}</div>
                        </button>
                      </div>
                      {pressing && <div className="note-longpress-progress" aria-hidden="true" />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {selectMode && selected.size > 0 && (
        <div className="notes-bulk-bar" role="region" aria-label="Selección">
          <span>
            {selected.size} {selected.size === 1 ? "nota" : "notas"}
          </span>
          <button type="button" className="notes-bulk-btn btn-tap" onClick={() => setConfirmBulk(true)}>
            Eliminar
          </button>
        </div>
      )}

      {!selectMode && (
        <button className="fab" onClick={() => setQuickOpen(true)} aria-label="Nota rápida">
          <Icon name="plus" size={24} strokeWidth={2.2} />
        </button>
      )}

      {quickOpen && (
        <QuickCaptureSheet
          onClose={() => setQuickOpen(false)}
          onSaved={(note, { openInEditor }) => {
            if (openInEditor) {
              setOriginRect(null);
              setEditing(note);
            }
          }}
        />
      )}

      {confirmBulk && (
        <Sheet
          title={`¿Eliminar ${selected.size} ${selected.size === 1 ? "nota" : "notas"}?`}
          onClose={() => setConfirmBulk(false)}
          footer={
            <div className="sheet-actions">
              <div className="sheet-actions-state">
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={async () => {
                    haptic.warn();
                    await deleteNotes([...selected]);
                    setConfirmBulk(false);
                    setSelected(new Set());
                    setSelectMode(false);
                  }}
                >
                  Eliminar
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setConfirmBulk(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          }
        >
          <p className="input-help" style={{ fontSize: "var(--text-md)", margin: 0 }}>Se borran con su historial. No hay papelera.</p>
        </Sheet>
      )}

      {livePropsNote && (
        <NotePropsSheet
          note={livePropsNote}
          onClose={() => setPropsNote(null)}
          onOpen={() => {
            setPropsNote(null);
            setOriginRect(null);
            setEditing(livePropsNote);
          }}
          onTogglePin={() => void togglePin(livePropsNote.id)}
          onLink={(links) => void linkNote(livePropsNote.id, links)}
          onDelete={async () => {
            await deleteNote(livePropsNote.id);
            setPropsNote(null);
          }}
          tagPicker={<NoteTagPicker noteId={livePropsNote.id} tags={noteTags} tagLinks={noteTagLinks} upsertTag={upsertTag} linkTag={linkTag} unlinkTag={unlinkTag} />}
        />
      )}

      {editing && (
        <NoteEditor
          key={editing.id}
          note={editing}
          originRect={originRect}
          onClose={() => {
            setEditing(null);
            setOriginRect(null);
          }}
        />
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={`chip ${active ? "active" : ""}`}
      aria-pressed={active}
      onClick={() => {
        haptic.tap();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

/* Long-press / right-click properties: tags, links, pin, delete. */
function NotePropsSheet({
  note,
  onClose,
  onOpen,
  onTogglePin,
  onLink,
  onDelete,
  tagPicker
}: {
  note: Note;
  onClose: () => void;
  onOpen: () => void;
  onTogglePin: () => void;
  onLink: (links: NoteLinks) => void;
  onDelete: () => Promise<void>;
  tagPicker: React.ReactNode;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <Sheet
      title={note.title || "Sin título"}
      onClose={onClose}
      footer={
        <div className="sheet-actions">
          <div className="sheet-actions-state">
            <button type="button" className="btn btn-primary" onClick={onOpen}>
              Abrir nota
            </button>
            <div className="quick-actions" style={{ padding: 0, borderTop: "none" }}>
              <button type="button" className="btn btn-secondary btn-mini" onClick={onTogglePin}>
                {note.pinned ? "Quitar de fijadas" : "Fijar"}
              </button>
              {confirm ? (
                <button type="button" className="btn btn-danger btn-mini" onClick={() => void onDelete()}>
                  Sí, eliminar
                </button>
              ) : (
                <button type="button" className="btn btn-ghost btn-mini" style={{ color: "var(--red)" }} onClick={() => setConfirm(true)}>
                  Eliminar
                </button>
              )}
            </div>
          </div>
        </div>
      }
    >
      {tagPicker}
      <NoteLinkFields value={note} onChange={onLink} />
    </Sheet>
  );
}
