import { useEffect, useMemo, useState } from "react";
import type { Note, NoteVersion } from "../../types";
import { Sheet } from "../Sheet";
import { useToast } from "../../context/ToastContext";
import { useNotes } from "../../hooks/useNotes";
import { diffLines, diffSummary } from "../../utils/noteDiff";
import { formatDateLong } from "../../utils/dates";
import { haptic } from "../../lib/haptics";

/* ── VersionHistorySheet ──
   The note's snapshots, newest first, each expandable into a line
   diff against the one before it (what landed IN that version).
   Restoring is a two-tap action and is itself reversible: the parent
   snapshots the current text first. */
export function VersionHistorySheet({
  note,
  onClose,
  onRestore
}: {
  note: Note;
  onClose: () => void;
  onRestore: (snapshot: { title: string; content: string }) => Promise<void>;
}) {
  const { loadVersions } = useNotes();
  const { showToast } = useToast();
  const [versions, setVersions] = useState<NoteVersion[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadVersions(note.id).then((rows) => {
      if (!alive) return;
      if (rows === null) {
        showToast("No se pudo cargar el historial", "error");
        setVersions([]);
      } else setVersions(rows);
    });
    return () => {
      alive = false;
    };
  }, [note.id, loadVersions, showToast]);

  async function restore(v: NoteVersion) {
    if (restoringId) return;
    setRestoringId(v.id);
    try {
      await onRestore({ title: v.title, content: v.content });
      haptic.success();
      onClose();
    } catch {
      haptic.warn();
      showToast("No se pudo restaurar la versión", "error");
    } finally {
      setRestoringId(null);
      setPendingId(null);
    }
  }

  const when = (iso: string) => `${formatDateLong(iso.slice(0, 10))} · ${new Date(iso).toTimeString().slice(0, 5)}`;

  return (
    <Sheet title="Historial" onClose={restoringId ? null : onClose}>
      {versions === null ? (
        <div className="money-list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="row-item" style={{ cursor: "default" }}>
              <div className="row-content">
                <div className="sk-bar" style={{ width: "40%", height: 14, marginBottom: 8 }} />
                <div className="sk-bar" style={{ width: "70%", height: 11 }} />
              </div>
            </div>
          ))}
        </div>
      ) : versions.length === 0 ? (
        <div className="money-list-empty">Todavía no hay versiones. Cada vez que guardes, la anterior queda aquí.</div>
      ) : (
        <div className="money-list">
          {versions.map((v, idx) => {
            const prev = versions[idx + 1];
            const summary = prev ? diffSummary(prev.content, v.content) : null;
            const expanded = expandedId === v.id;
            const isLatest = idx === 0;
            return (
              <div key={v.id} className="note-version">
                <button
                  type="button"
                  className="row-item btn-tap note-version-head"
                  aria-expanded={expanded}
                  onClick={() => {
                    haptic.tap();
                    setExpandedId(expanded ? null : v.id);
                    setPendingId(null);
                  }}
                >
                  <div className="row-content">
                    <div className="row-title">
                      Versión {v.versionNo}
                      {isLatest ? <span className="badge badge-teal" style={{ marginLeft: 8 }}>Actual</span> : null}
                    </div>
                    <div className="row-sub">{when(v.createdAt)}</div>
                  </div>
                  {summary && (summary.added > 0 || summary.removed > 0) && (
                    <span className="note-version-delta">
                      {summary.added > 0 && <span className="note-version-added">+{summary.added}</span>}
                      {summary.removed > 0 && <span className="note-version-removed">−{summary.removed}</span>}
                    </span>
                  )}
                </button>
                {expanded && (
                  <div className="note-version-body">
                    {v.title && <div className="note-version-title">{v.title}</div>}
                    <VersionDiff before={prev?.content ?? ""} after={v.content} hasPrev={!!prev} />
                    {!isLatest &&
                      (pendingId === v.id ? (
                        <div className="note-version-actions">
                          <button type="button" className="btn btn-primary" disabled={restoringId === v.id} onClick={() => void restore(v)}>
                            {restoringId === v.id ? "Restaurando…" : "Sí, restaurar esta versión"}
                          </button>
                          <button type="button" className="btn btn-ghost" onClick={() => setPendingId(null)}>
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="note-version-actions">
                          <button type="button" className="btn btn-secondary" onClick={() => setPendingId(v.id)}>
                            Restaurar
                          </button>
                          <div className="input-help">La versión actual se guarda antes, así que puedes volver.</div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}

function VersionDiff({ before, after, hasPrev }: { before: string; after: string; hasPrev: boolean }) {
  const chunks = useMemo(() => (hasPrev ? diffLines(before, after) : after ? [{ type: "same" as const, text: after }] : []), [before, after, hasPrev]);
  if (chunks.length === 0) return <div className="input-help">Sin cambios en el texto.</div>;
  return (
    <div className="note-diff scroll-bounce">
      {chunks.map((c, i) => (
        <div key={i} className={`note-diff-chunk note-diff-chunk--${c.type}`}>
          {c.text || " "}
        </div>
      ))}
    </div>
  );
}
