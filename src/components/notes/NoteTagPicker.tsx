import { useMemo, useState } from "react";
import type { NoteTag, NoteTagLink } from "../../types";
import { Icon } from "../Icon";
import { haptic } from "../../lib/haptics";

/* ── NoteTagPicker ──
   Tags on one note: the linked chips (tap × to unlink), a free-text
   input (type + Enter creates or reuses the tag and links it), and
   her other tags as one-tap suggestions. */
export function NoteTagPicker({
  noteId,
  tags,
  tagLinks,
  upsertTag,
  linkTag,
  unlinkTag
}: {
  noteId: string;
  tags: NoteTag[];
  tagLinks: NoteTagLink[];
  upsertTag: (label: string) => Promise<NoteTag | null>;
  linkTag: (noteId: string, tagId: string) => Promise<unknown>;
  unlinkTag: (noteId: string, tagId: string) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const linkedIds = useMemo(() => {
    const s = new Set<string>();
    for (const l of tagLinks) if (l.noteId === noteId) s.add(l.tagId);
    return s;
  }, [tagLinks, noteId]);
  const linked = useMemo(() => tags.filter((t) => linkedIds.has(t.id)), [tags, linkedIds]);
  const suggestions = useMemo(
    () =>
      tags
        .filter((t) => !linkedIds.has(t.id))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.label.localeCompare(b.label))
        .slice(0, 8),
    [tags, linkedIds]
  );

  async function addFromInput() {
    const label = draft.trim();
    if (!label || busy) return;
    setBusy(true);
    try {
      const tag = await upsertTag(label);
      if (tag) {
        await linkTag(noteId, tag.id);
        haptic.tap();
      }
      setDraft("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="input-group">
      <div className="input-label">Etiquetas</div>
      {linked.length > 0 && (
        <div className="note-tag-row">
          {linked.map((tag) => (
            <span key={tag.id} className="note-tag-chip">
              <span className="note-tag-chip-label">{tag.label}</span>
              <button
                type="button"
                className="note-tag-chip-x btn-tap"
                aria-label={`Quitar etiqueta ${tag.label}`}
                onClick={() => {
                  haptic.tap();
                  void unlinkTag(noteId, tag.id);
                }}
              >
                <Icon name="x" size={11} strokeWidth={2.4} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="input"
        type="text"
        placeholder="Nueva etiqueta + Enter"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void addFromInput();
          }
        }}
        disabled={busy}
        aria-label="Nueva etiqueta"
      />
      {suggestions.length > 0 && (
        <div className="note-tag-row" style={{ marginTop: 8 }}>
          {suggestions.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className="note-tag-suggest btn-tap"
              onClick={() => {
                haptic.tap();
                void linkTag(noteId, tag.id);
              }}
            >
              + {tag.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
