import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import { useNotes, type NoteLinks } from "../hooks/useNotes";
import { useEscape } from "../hooks/useEscape";
import type { Note } from "../types";
import { MarkdownEditor, type MarkdownEditorHandle } from "./notes/MarkdownEditor";
import { FormatToolbar } from "./notes/FormatToolbar";
import { FindInNote } from "./notes/FindInNote";
import { NoteOutline } from "./notes/NoteOutline";
import { NoteLinkChip } from "./notes/NoteLinkChip";
import { NoteTagPicker } from "./notes/NoteTagPicker";
import { VersionHistorySheet } from "./notes/VersionHistorySheet";
import { AttachmentStrip } from "./notes/AttachmentStrip";
import { CoverPickerSheet } from "./notes/CoverPickerSheet";
import { useAttachmentSrc, useNoteAttachments } from "../hooks/useNoteAttachments";
import { isImageMime, storageErrorMessage } from "../lib/files";
import { useNoteAutosave } from "../hooks/useNoteAutosave";
import { useNoteOutline } from "../hooks/useNoteOutline";
import { extractOutline } from "../utils/outline";
import { toPlainText } from "../utils/markdownModel";
import { NOTE_TEMPLATES, applyTemplate, type NoteTemplate } from "../data/noteTemplates";
import { Sheet } from "./Sheet";
import { Icon, type IconName } from "./Icon";
import { formatDateLong, formatWithWeekday, todayISO } from "../utils/dates";
import { haptic } from "../lib/haptics";

/* ── NoteEditor ──
   The full-height writing surface: header (back · save state ·
   outline · pin · menu), format toolbar, optional find bar, the link
   chip, then title + live markdown body. Autosaves 800 ms after the
   last keystroke; an empty note is deleted on close instead of being
   kept as clutter. Mounted through a portal so it sits above whatever
   sheet opened it; its own sheets (outline, tags, link, history,
   delete) stack inside it. */

const TEMPLATE_DATE = () => formatWithWeekday(todayISO());

function isEffectivelyEmpty(title: string, content: string) {
  const t = title.trim();
  const c = content.trim();
  if (!t && !c) return true;
  const date = TEMPLATE_DATE();
  for (const tpl of NOTE_TEMPLATES) {
    if (tpl.id === "blank") continue;
    const applied = applyTemplate(tpl, date);
    if (c === applied.content.trim() && (!t || t === applied.title)) return true;
  }
  return false;
}

export function NoteEditor({
  note,
  onClose,
  originRect = null
}: {
  note: Note;
  onClose: () => void;
  /** The row she tapped, so the surface grows out of it. */
  originRect?: DOMRect | null;
}) {
  const { notes, updateNote } = useApp();
  const { saveNote, restoreNote, togglePin, linkNote, deleteNote, noteTags, noteTagLinks, upsertTag, linkTag, unlinkTag } = useNotes();
  const attachments = useNoteAttachments();
  const src = useAttachmentSrc(note.id);
  const { showToast, showSuccess } = useToast();
  // The live row (pin, links and tags change underneath the editor).
  const live = notes.find((n) => n.id === note.id) ?? note;

  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const [exiting, setExiting] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [readingMode, setReadingMode] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [flash, setFlash] = useState("");
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MarkdownEditorHandle | null>(null);

  const { saveState, setSaveState, scheduleSave, cancelPending } = useNoteAutosave({
    onSave: (d) => saveNote(note.id, d),
    onSaveFailed: () => showToast("No se pudo guardar la nota. Sigue escribiendo; lo reintentamos.", "error")
  });

  const latest = useRef({ title, content });
  useEffect(() => {
    latest.current = { title, content };
  });

  const doClose = useCallback(async () => {
    const { title: ti, content: co } = latest.current;
    cancelPending();
    try {
      if (isEffectivelyEmpty(ti, co)) await deleteNote(note.id);
      else await saveNote(note.id, { title: ti.trim(), content: co });
    } catch {
      showToast("No se pudo guardar la nota", "error");
    }
    onClose();
  }, [cancelPending, deleteNote, saveNote, note.id, onClose, showToast]);

  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    []
  );
  const handleClose = useCallback(() => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
    setExiting(true);
    exitTimer.current = setTimeout(() => {
      exitTimer.current = null;
      void doClose();
    }, 240);
  }, [doClose]);

  const anySheet = outlineOpen || historyOpen || tagsOpen || linkOpen || confirmDelete || coverOpen;
  useEscape(anySheet || menuOpen ? null : handleClose);

  /* ── Images ──
     Three ways in — the paperclip, a drop, a paste — all land in
     uploadImage: bytes to R2, a row, then a markdown reference at
     the caret so the body keeps the link. Ten per action at most. */
  const uploadImage = useCallback(
    async (file: File) => {
      if (!isImageMime(file.type) && !/\.(heic|heif)$/i.test(file.name)) {
        showToast("Solo se pueden adjuntar imágenes a una nota.", "error");
        return;
      }
      setAttachBusy(true);
      try {
        const row = await attachments.upload(note.id, file);
        editorRef.current?.insertText(`\n![](attachment:${row.id})\n`);
        haptic.success();
      } catch (err) {
        haptic.warn();
        showToast(storageErrorMessage(err), "error");
      } finally {
        setAttachBusy(false);
      }
    },
    [attachments, note.id, showToast]
  );
  const uploadMany = useCallback(
    async (files: File[]) => {
      if (files.length > 10) showToast("Máximo 10 imágenes por vez; se adjuntan las primeras 10.", "warning");
      for (const f of files.slice(0, 10)) await uploadImage(f);
    },
    [uploadImage, showToast]
  );
  const onPaperclipClick = useCallback(() => {
    if (attachBusy || readingMode) return;
    attachInputRef.current?.click();
  }, [attachBusy, readingMode]);
  const onScrollPaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (readingMode) return;
      const items = e.clipboardData?.items ? Array.from(e.clipboardData.items) : [];
      const file = items.find((it) => it.kind === "file" && /^image\//.test(it.type))?.getAsFile();
      if (file) {
        e.preventDefault();
        void uploadImage(file);
      }
    },
    [readingMode, uploadImage]
  );
  const onScrollDrop = useCallback(
    (e: React.DragEvent) => {
      if (readingMode) return;
      e.preventDefault();
      setDragOver(false);
      void uploadMany(Array.from(e.dataTransfer?.files ?? []).filter((f) => /^image\//.test(f.type)));
    },
    [readingMode, uploadMany]
  );

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    scheduleSave(e.target.value, content);
  };
  const handleContentChange = useCallback(
    (next: string) => {
      setContent(next);
      scheduleSave(latest.current.title, next);
    },
    [scheduleSave]
  );
  const handleSelectionChange = useCallback(({ active }: { active?: Set<string> }) => {
    setActiveFormats(active ?? new Set());
  }, []);

  const activeHeadingLine = useNoteOutline(content, scrollRef);
  const hasHeadings = useMemo(() => extractOutline(content).length > 0, [content]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 2);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: Event) => {
      const el = e.target as HTMLElement;
      if (!el.closest(".mde-menu") && !el.closest("[data-menu-trigger]")) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [menuOpen]);

  const onInlineFormat = (kind: string) => editorRef.current?.applyInlineFormat(kind);
  const onBlockFormat = (block: string) => editorRef.current?.applyBlockFormat(block);
  const handleJumpToMatch = useCallback((m: { line: number; startCol: number; endCol: number }) => editorRef.current?.jumpTo(m), []);
  const handleJumpToLine = useCallback((line: number) => {
    setOutlineOpen(false);
    editorRef.current?.jumpTo({ line, startCol: 0, endCol: 0 });
  }, []);

  const handleLinkChange = (links: NoteLinks) => {
    void linkNote(note.id, links);
  };

  const handleRestore = useCallback(
    async (snap: { title: string; content: string }) => {
      const prev = { ...latest.current };
      setTitle(snap.title);
      setContent(snap.content);
      editorRef.current?.setContent(snap.content);
      cancelPending();
      setSaveState("saving");
      try {
        await restoreNote(note.id, prev, snap);
        setSaveState("saved");
      } catch {
        setTitle(prev.title);
        setContent(prev.content);
        editorRef.current?.setContent(prev.content);
        setSaveState("dirty");
        throw new Error("save_failed");
      }
    },
    [restoreNote, note.id, cancelPending, setSaveState]
  );

  const pickTemplate = (tpl: NoteTemplate) => {
    const applied = applyTemplate(tpl, TEMPLATE_DATE());
    setTitle(applied.title);
    setContent(applied.content);
    editorRef.current?.setContent(applied.content);
    scheduleSave(applied.title, applied.content);
    editorRef.current?.focus();
    haptic.tap();
  };

  const flashMsg = (msg: string) => {
    setFlash(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(""), 1800);
  };
  const copyText = async (text: string) => {
    setMenuOpen(false);
    try {
      await navigator.clipboard.writeText(text);
      haptic.success();
      flashMsg("Copiado");
    } catch {
      haptic.warn();
      showToast("No se pudo copiar", "error");
    }
  };
  const exportMd = () => {
    setMenuOpen(false);
    try {
      const text = title ? `# ${title}\n\n${content}` : content;
      const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = (title || "nota").replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 60) || "nota";
      a.download = `${safe}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      haptic.success();
    } catch {
      haptic.warn();
      showToast("No se pudo exportar", "error");
    }
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const readingMins = wordCount > 0 ? Math.max(1, Math.round(wordCount / 200)) : 0;
  const dateStr = `${formatDateLong(live.updatedAt.slice(0, 10))} · ${new Date(live.updatedAt).toTimeString().slice(0, 5)}`;

  const isBrandNewEmpty = !title && !content && !note.title && !note.content;
  const [templatesMounted, setTemplatesMounted] = useState(isBrandNewEmpty);
  useEffect(() => {
    if (isBrandNewEmpty) {
      setTemplatesMounted(true);
      return;
    }
    if (!templatesMounted) return;
    const t = setTimeout(() => setTemplatesMounted(false), 360);
    return () => clearTimeout(t);
  }, [isBrandNewEmpty, templatesMounted]);

  const hasValidOrigin = !!(originRect && originRect.width > 4 && originRect.height > 4);
  const shellStyle = (
    hasValidOrigin && originRect
      ? {
          "--mde-origin-x": `${originRect.left}px`,
          "--mde-origin-y": `${originRect.top}px`,
          "--mde-origin-sx": originRect.width / window.innerWidth,
          "--mde-origin-sy": originRect.height / window.innerHeight
        }
      : {}
  ) as React.CSSProperties;
  const shellClass = "note-editor-shell" + (exiting ? " note-editor-exit" : " note-editor-enter") + (readingMode ? " mde-reading-mode" : "");

  const MenuItem = ({ icon, label, onClick, danger }: { icon: IconName; label: string; onClick: () => void; danger?: boolean }) => (
    <button type="button" className={"mde-menu-item" + (danger ? " is-danger" : "")} role="menuitem" onClick={onClick}>
      <Icon name={icon} size={15} />
      <span>{label}</span>
    </button>
  );

  return createPortal(
    <div className={shellClass} style={shellStyle} data-from-origin={hasValidOrigin ? "true" : undefined} role="dialog" aria-modal="true" aria-label={title || "Nota"}>
      <div className={"mde-header" + (scrolled ? " is-scrolled" : "")}>
        <button type="button" className="mde-back btn-tap" onClick={handleClose}>
          <Icon name="chevron-left" size={18} strokeWidth={2.4} />
          <span>Notas</span>
        </button>
        <div className="mde-header-actions">
          <span className={"mde-save-indicator " + (saveState === "saved" ? "is-saved" : "is-saving")} role="status">
            <span className="mde-save-dot" aria-hidden="true" />
            <span className="mde-save-label">{saveState === "saved" ? "Guardada" : saveState === "saving" ? "Guardando…" : "Sin guardar"}</span>
          </span>
          {hasHeadings && (
            <button type="button" className={"mde-icon-btn" + (outlineOpen ? " is-active" : "")} onClick={() => setOutlineOpen(true)} aria-label="Esquema">
              <Icon name="list" size={18} />
            </button>
          )}
          <button
            type="button"
            className={"mde-icon-btn" + (live.pinned ? " is-pinned" : "")}
            onClick={() => {
              haptic.tap();
              void togglePin(note.id);
            }}
            aria-label={live.pinned ? "Quitar de fijadas" : "Fijar"}
            aria-pressed={live.pinned}
          >
            <Icon name="star" size={17} />
          </button>
          <div style={{ position: "relative" }}>
            <button type="button" data-menu-trigger className="mde-icon-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="Opciones" aria-expanded={menuOpen} aria-haspopup="menu">
              <Icon name="more" size={18} strokeWidth={3} />
            </button>
            {menuOpen && (
              <div className="mde-menu" role="menu">
                <MenuItem icon="search" label="Buscar en la nota" onClick={() => { setMenuOpen(false); setFindOpen(true); }} />
                <MenuItem icon="tag" label="Etiquetas" onClick={() => { setMenuOpen(false); setTagsOpen(true); }} />
                <MenuItem icon="link" label="Vincular" onClick={() => { setMenuOpen(false); setLinkOpen(true); }} />
                <MenuItem icon="history" label="Historial" onClick={() => { setMenuOpen(false); setHistoryOpen(true); }} />
                <MenuItem icon="image" label={live.coverAttachmentId ? "Cambiar portada" : "Poner portada"} onClick={() => { setMenuOpen(false); setCoverOpen(true); }} />
                <MenuItem icon="eye" label={readingMode ? "Salir de lectura" : "Modo lectura"} onClick={() => { setMenuOpen(false); setReadingMode((v) => !v); }} />
                <div className="mde-menu-sep" />
                <MenuItem icon="copy" label="Copiar texto" onClick={() => void copyText(title ? `${title}\n\n${toPlainText(content)}` : toPlainText(content))} />
                <MenuItem icon="edit" label="Copiar markdown" onClick={() => void copyText(title ? `# ${title}\n\n${content}` : content)} />
                <MenuItem icon="download" label="Exportar .md" onClick={exportMd} />
                <div className="mde-menu-sep" />
                <MenuItem icon="trash" label="Eliminar" danger onClick={() => { setMenuOpen(false); setConfirmDelete(true); }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {!readingMode && <FormatToolbar active={activeFormats} onInline={onInlineFormat} onBlock={onBlockFormat} onAttachClick={onPaperclipClick} disabled={attachBusy} />}

      {findOpen && (
        <FindInNote
          title={title}
          content={content}
          onJump={handleJumpToMatch}
          onClose={() => {
            setFindOpen(false);
            editorRef.current?.focus();
          }}
        />
      )}

      <div className="mde-context-row">
        <NoteLinkChip note={live} open={linkOpen} onOpen={() => setLinkOpen(true)} onClose={() => setLinkOpen(false)} onChange={handleLinkChange} readOnly={readingMode} />
      </div>

      <div
        ref={scrollRef}
        className={"mde-scroll scroll-bounce" + (dragOver ? " is-drag-over" : "")}
        onPaste={onScrollPaste}
        onDrop={onScrollDrop}
        onDragOver={(e) => {
          if (!readingMode && e.dataTransfer?.types?.includes("Files")) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragOver(false);
        }}
      >
        <div className="mde-date">{dateStr}</div>

        {live.coverAttachmentId &&
          (() => {
            const tile = src.tiles[live.coverAttachmentId];
            const failed = !tile?.url && tile?.failed;
            return (
              <button
                type="button"
                className={"mde-cover btn-tap" + (tile?.url ? "" : " is-loading") + (failed ? " is-failed" : "")}
                onClick={() => (failed ? src.retryTile(live.coverAttachmentId as string) : setCoverOpen(true))}
                aria-label={failed ? "Reintentar" : "Cambiar portada"}
                aria-busy={!tile?.url && !failed}
              >
                {tile?.url ? <img src={tile.url} alt="" /> : failed ? <span className="mde-cover-retry" aria-hidden="true">↻</span> : <span className="mde-cover-shimmer" aria-hidden="true" />}
              </button>
            );
          })()}

        {templatesMounted && (
          <div className={"mde-templates" + (isBrandNewEmpty ? "" : " is-collapsed")} aria-hidden={!isBrandNewEmpty}>
            <div className="mde-templates-label">Empieza con</div>
            <div className="mde-template-pills">
              {NOTE_TEMPLATES.filter((t) => t.id !== "blank").map((tpl) => (
                <button key={tpl.id} type="button" className="mde-template-pill" onClick={() => pickTemplate(tpl)} tabIndex={isBrandNewEmpty ? 0 : -1}>
                  <Icon name={tpl.icon} size={14} />
                  <span>{tpl.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <span className="mde-title-wrap">
          <input
            type="text"
            className="mde-title"
            value={title}
            onChange={handleTitleChange}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                editorRef.current?.focus();
              }
            }}
            placeholder="Título"
            autoFocus={isBrandNewEmpty}
            readOnly={readingMode}
            aria-label="Título"
          />
        </span>

        <MarkdownEditor
          ref={editorRef}
          initialContent={content}
          readOnly={readingMode}
          onContentChange={handleContentChange}
          onSelectionChange={handleSelectionChange}
          onRequestFind={() => setFindOpen(true)}
          placeholder="Escribe aquí… Usa / para insertar un título o una lista."
          ariaLabel="Cuerpo de la nota"
          attachmentTiles={src.tiles}
        />

        <AttachmentStrip rows={src.rows} tiles={src.tiles} retryTile={src.retryTile} onDelete={(row) => attachments.remove(row)} />

        <input
          ref={attachInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void uploadMany(files);
          }}
        />

        {dragOver && (
          <div className="mde-drop-overlay" aria-hidden="true">
            <div className="mde-drop-overlay-inner">Suelta la imagen aquí</div>
          </div>
        )}
      </div>

      {wordCount > 0 && (
        <div className="mde-footer">
          <span className="mde-footer-left">{readingMins > 0 ? `${readingMins} min de lectura` : ""}</span>
          <span className="mde-footer-right">
            {wordCount} {wordCount === 1 ? "palabra" : "palabras"}
          </span>
        </div>
      )}

      {outlineOpen && (
        <Sheet title="Esquema" onClose={() => setOutlineOpen(false)}>
          <NoteOutline content={content} onJump={handleJumpToLine} variant="drawer" activeLine={activeHeadingLine} />
        </Sheet>
      )}

      {tagsOpen && (
        <Sheet
          title="Etiquetas"
          onClose={() => setTagsOpen(false)}
          footer={
            <div className="sheet-actions">
              <button type="button" className="btn btn-primary" onClick={() => setTagsOpen(false)}>
                Listo
              </button>
            </div>
          }
        >
          <NoteTagPicker noteId={note.id} tags={noteTags} tagLinks={noteTagLinks} upsertTag={upsertTag} linkTag={linkTag} unlinkTag={unlinkTag} />
        </Sheet>
      )}

      {historyOpen && <VersionHistorySheet note={live} onClose={() => setHistoryOpen(false)} onRestore={handleRestore} />}

      {coverOpen && (
        <CoverPickerSheet
          rows={src.rows}
          tiles={src.tiles}
          currentCoverId={live.coverAttachmentId}
          onPick={(id) => updateNote(note.id, { coverAttachmentId: id })}
          onClear={() => updateNote(note.id, { coverAttachmentId: null })}
          onRequestAttach={onPaperclipClick}
          onClose={() => setCoverOpen(false)}
        />
      )}

      {confirmDelete && (
        <Sheet
          title="¿Eliminar esta nota?"
          onClose={() => setConfirmDelete(false)}
          footer={
            <div className="sheet-actions">
              <div className="sheet-actions-state">
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={async () => {
                    cancelPending();
                    haptic.warn();
                    await deleteNote(note.id);
                    showSuccess("Nota eliminada");
                    onClose();
                  }}
                >
                  Eliminar
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          }
        >
          <p className="input-help" style={{ fontSize: "var(--text-md)", margin: 0 }}>
            Se borra con su historial. Lo que esté ligado (curso, sesión, tarea, pieza) no se toca.
          </p>
        </Sheet>
      )}

      {flash && <div className="mde-flash">{flash}</div>}
    </div>,
    document.body
  );
}
