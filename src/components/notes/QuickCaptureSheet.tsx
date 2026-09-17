import { useEffect, useRef, useState } from "react";
import type { Note } from "../../types";
import { Sheet } from "../Sheet";
import { useNotes, type NoteLinks } from "../../hooks/useNotes";
import { useToast } from "../../context/ToastContext";
import { useDirtyGuard } from "../../hooks/useDirtyGuard";
import { haptic } from "../../lib/haptics";
import { prefersAutoFocus } from "../../lib/device";

/* ── QuickCaptureSheet ──
   "Jot now, file later": a title and a body, nothing else. The note
   lands unlinked (the Inbox) unless the caller pre-links it; the full
   editor stays one tap away. */
export function QuickCaptureSheet({
  links,
  onClose,
  onSaved
}: {
  links?: NoteLinks;
  onClose: () => void;
  onSaved?: (note: Note, opts: { openInEditor: boolean }) => void;
}) {
  const { createNote } = useNotes();
  const { showToast, showSuccess } = useToast();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!prefersAutoFocus()) return; // on a phone she taps the field herself — no keyboard ambush
    const id = setTimeout(() => textareaRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, []);

  const isEmpty = !title.trim() && !content.trim();
  const dirty = useDirtyGuard({ title, content });
  const safeClose = busy ? null : onClose;

  async function save(openInEditor = false) {
    if (busy) return;
    if (isEmpty && !openInEditor) {
      onClose();
      return;
    }
    setBusy(true);
    const note = await createNote({ title: title.trim(), content, ...links });
    if (!note) {
      haptic.warn();
      showToast("No se pudo guardar la nota", "error");
      setBusy(false);
      return;
    }
    haptic.success();
    if (!openInEditor) showSuccess("Nota guardada");
    onSaved?.(note, { openInEditor });
    onClose();
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void save();
    }
  };

  return (
    <Sheet
      title="Nota rápida"
      onClose={safeClose}
      dirty={dirty}
      discardText="¿Descartar la nota? Lo que escribiste no se guarda."
      footer={
        <div className="sheet-actions">
          <div className="sheet-actions-state">
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || isEmpty}>
              {busy ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void save(true)} disabled={busy}>
              Abrir editor completo
            </button>
          </div>
        </div>
      }
    >
      <input
        type="text"
        className="quick-note-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Título (opcional)"
        disabled={busy}
        aria-label="Título"
      />
      <textarea
        ref={textareaRef}
        className="input quick-note-body"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Lo que no quieres olvidar…"
        disabled={busy}
        rows={6}
        aria-label="Nota"
      />
    </Sheet>
  );
}
