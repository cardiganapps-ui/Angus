import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";
import { haptic } from "../../lib/haptics";

/* ── FindInNote ──
   A slim bar at the top of the editor: case-insensitive substring
   search over the body (the title counts as one hit). Enter advances,
   Shift+Enter goes back, Escape closes. It never mutates content — it
   asks the parent to jump the editor's selection to each match. */

export interface FindMatch {
  line: number;
  startCol: number;
  endCol: number;
}

export function FindInNote({
  title,
  content,
  onJump,
  onClose,
  initialQuery = ""
}: {
  title?: string | null;
  content?: string | null;
  onJump?: (match: FindMatch) => void;
  onClose: () => void;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [current, setCurrent] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const out: FindMatch[] = [];
    const lines = (content || "").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i].toLowerCase();
      let from = 0;
      while (from < ln.length) {
        const idx = ln.indexOf(q, from);
        if (idx < 0) break;
        out.push({ line: i, startCol: idx, endCol: idx + q.length });
        from = idx + Math.max(1, q.length);
      }
    }
    return out;
  }, [query, content]);

  const safeCurrent = matches.length === 0 ? -1 : Math.min(current, matches.length - 1);

  useEffect(() => {
    if (safeCurrent >= 0 && matches[safeCurrent]) onJump?.(matches[safeCurrent]);
  }, [safeCurrent, matches, onJump]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, []);

  const next = () => {
    if (matches.length === 0) return;
    setCurrent((c) => (c + 1) % matches.length);
    haptic.tap();
  };
  const prev = () => {
    if (matches.length === 0) return;
    setCurrent((c) => (c - 1 + matches.length) % matches.length);
    haptic.tap();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) prev();
      else next();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const hasTitleHit = !!query.trim() && !!title && title.toLowerCase().includes(query.trim().toLowerCase());
  const totalHits = matches.length + (hasTitleHit ? 1 : 0);
  const displayCurrent = matches.length > 0 ? safeCurrent + 1 + (hasTitleHit ? 1 : 0) : hasTitleHit ? 1 : 0;

  return (
    <div className="mde-find">
      <div className="mde-find-input-wrap">
        <Icon name="search" size={14} />
        <input
          ref={inputRef}
          className="mde-find-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Buscar en la nota"
          aria-label="Buscar en la nota"
        />
      </div>
      <div className="mde-find-counter" aria-live="polite">
        {query.trim() ? (totalHits > 0 ? `${displayCurrent} de ${totalHits}` : "Sin coincidencias") : ""}
      </div>
      <button type="button" className="mde-find-btn" onClick={prev} disabled={matches.length === 0} aria-label="Anterior">
        <Icon name="chevron-down" size={14} strokeWidth={2.2} />
      </button>
      <button type="button" className="mde-find-btn mde-find-btn--next" onClick={next} disabled={matches.length === 0} aria-label="Siguiente">
        <Icon name="chevron-down" size={14} strokeWidth={2.2} />
      </button>
      <button type="button" className="mde-find-btn" onClick={onClose} aria-label="Cerrar">
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}
