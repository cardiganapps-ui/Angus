import { useMemo } from "react";
import type { NoteTag, NoteTagLink } from "../../types";
import { haptic } from "../../lib/haptics";

/* ── TagFilterPills ──
   A scrolling row of her tags with note counts above the list. Tapping
   toggles a filter; several selected tags narrow with AND. Hidden
   until the first tag exists. */
export function TagFilterPills({
  tags,
  tagLinks,
  selectedIds,
  onToggle
}: {
  tags: NoteTag[];
  tagLinks: NoteTagLink[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of tagLinks) m.set(l.tagId, (m.get(l.tagId) || 0) + 1);
    return m;
  }, [tagLinks]);

  const visible = tags.filter((t) => (counts.get(t.id) || 0) > 0).sort((a, b) => a.label.localeCompare(b.label));
  if (visible.length === 0) return null;

  return (
    <div className="filter-row" role="group" aria-label="Filtrar por etiqueta">
      {visible.map((tag) => {
        const active = selectedIds.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            className={`chip tag-filter-pill ${active ? "active" : ""}`}
            aria-pressed={active}
            onClick={() => {
              haptic.tap();
              onToggle(tag.id);
            }}
          >
            <span className="tag-filter-pill-label">{tag.label}</span>
            <span className="tag-filter-pill-count">{counts.get(tag.id) || 0}</span>
          </button>
        );
      })}
    </div>
  );
}
