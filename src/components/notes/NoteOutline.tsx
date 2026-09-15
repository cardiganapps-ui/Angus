import { useMemo } from "react";
import { extractOutline } from "../../utils/outline";

/* ── NoteOutline ──
   The note's `#` / `##` / `###` headings as a tappable list; picking
   one asks the parent to scroll the editor there. `activeLine` marks
   the heading currently in view (useNoteOutline). */
export function NoteOutline({
  content,
  onJump,
  variant = "drawer",
  activeLine = null
}: {
  content?: string | null;
  onJump: (line: number) => void;
  variant?: "drawer" | "rail";
  activeLine?: number | null;
}) {
  const items = useMemo(() => extractOutline(content), [content]);

  return (
    <div className={"mde-outline mde-outline--" + variant}>
      <div className="mde-outline-title">Esquema</div>
      {items.length === 0 ? (
        <div className="mde-outline-empty">Agrega títulos con # para ver el esquema de la nota.</div>
      ) : (
        <ul className="mde-outline-list">
          {items.map((it, idx) => {
            const isActive = activeLine != null && it.line === activeLine;
            return (
              <li key={idx} className={"mde-outline-item mde-outline-lvl-" + it.level + (isActive ? " is-active" : "")}>
                <button type="button" className="mde-outline-btn" aria-current={isActive ? "true" : undefined} onClick={() => onJump(it.line)}>
                  <span className="mde-outline-dot" />
                  <span className="mde-outline-text">{it.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
