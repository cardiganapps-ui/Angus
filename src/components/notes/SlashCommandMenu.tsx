import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/* ── SlashCommandMenu ──
   Notion-style "/" inserter: opens at the caret when she types "/" at
   the start of an empty line and offers one tap per block format.
   Tap selects, Escape or a tap outside closes; the "/" stays in the
   line when she dismisses, so nothing is second-guessed. */

const G = (path: React.ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);
const GlyphH1 = G(<><path d="M4 6v12M12 6v12M4 12h8" /><path d="M17 10l3-2v10" /></>);
const GlyphH2 = G(<><path d="M4 6v12M12 6v12M4 12h8" /><path d="M17 10c0-1.5 1-2 2.5-2s2.5 0.8 2.5 2.3c0 2.2-5 3.7-5 7.7h5" /></>);
const GlyphH3 = G(<><path d="M4 6v12M12 6v12M4 12h8" /><path d="M17 9c0-1 1-2 2.5-2s2.5 1 2.5 2-1 2-2.5 2c1.5 0 2.5 1 2.5 2.5s-1 2.5-2.5 2.5-2.5-1-2.5-2" /></>);
const GlyphUL = G(<><circle cx="5" cy="7" r="1.5" fill="currentColor" stroke="none" /><line x1="10" y1="7" x2="20" y2="7" /><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" /><line x1="10" y1="12" x2="20" y2="12" /><circle cx="5" cy="17" r="1.5" fill="currentColor" stroke="none" /><line x1="10" y1="17" x2="20" y2="17" /></>);
const GlyphOL = G(<><line x1="10" y1="7" x2="20" y2="7" /><line x1="10" y1="12" x2="20" y2="12" /><line x1="10" y1="17" x2="20" y2="17" /><text x="1" y="9" fontSize="7" fontWeight="700" fontFamily="Nunito, sans-serif" fill="currentColor" stroke="none">1</text><text x="1" y="14.5" fontSize="7" fontWeight="700" fontFamily="Nunito, sans-serif" fill="currentColor" stroke="none">2</text><text x="1" y="20" fontSize="7" fontWeight="700" fontFamily="Nunito, sans-serif" fill="currentColor" stroke="none">3</text></>);
const GlyphTask = G(<><rect x="3" y="4" width="6" height="6" rx="1.4" /><line x1="12" y1="7" x2="21" y2="7" /><rect x="3" y="14" width="6" height="6" rx="1.4" /><path d="M4.5 17l1.5 1.5 2.5-3" /><line x1="12" y1="17" x2="21" y2="17" /></>);

export interface SlashCommand {
  key: string;
  label: string;
  glyph: React.ReactNode;
  /** What the command inserts at line start. */
  prefix: string;
}

const COMMANDS: SlashCommand[] = [
  { key: "h1", label: "Título 1", glyph: GlyphH1, prefix: "# " },
  { key: "h2", label: "Título 2", glyph: GlyphH2, prefix: "## " },
  { key: "h3", label: "Título 3", glyph: GlyphH3, prefix: "### " },
  { key: "ul", label: "Lista", glyph: GlyphUL, prefix: "- " },
  { key: "ol", label: "Numerada", glyph: GlyphOL, prefix: "1. " },
  { key: "task", label: "Checklist", glyph: GlyphTask, prefix: "[ ] " }
];

export function SlashCommandMenu({
  open,
  anchorRect,
  onSelect,
  onClose
}: {
  open?: boolean;
  anchorRect?: { top: number; bottom: number; left: number } | null;
  onSelect?: (command: SlashCommand) => void;
  onClose?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // The line that just gained the "/" may still be scrolling into
    // view; only a scroll after the menu has settled dismisses it.
    const openedAt = Date.now();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      }
    };
    const onDocPointer = (e: Event) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      onClose?.();
    };
    const onScroll = () => {
      if (Date.now() - openedAt < 400) return;
      onClose?.();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("touchstart", onDocPointer, { passive: true });
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("touchstart", onDocPointer);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [open, onClose]);

  if (!open || !anchorRect) return null;

  const MENU_HEIGHT = 260;
  const MENU_WIDTH = 240;
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const wantBelow = anchorRect.bottom + MENU_HEIGHT + margin <= vh;
  const top = wantBelow ? anchorRect.bottom + margin : Math.max(margin, anchorRect.top - MENU_HEIGHT - margin);
  const left = Math.min(anchorRect.left, vw - MENU_WIDTH - margin);

  return createPortal(
    <div ref={ref} role="menu" aria-label="Insertar" className="slash-menu" style={{ top, left, width: MENU_WIDTH }}>
      {COMMANDS.map((c) => (
        <button key={c.key} type="button" role="menuitem" className="slash-menu-item" onMouseDown={(e) => e.preventDefault()} onClick={() => onSelect?.(c)}>
          <span className="slash-menu-glyph">{c.glyph}</span>
          <span>{c.label}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}
