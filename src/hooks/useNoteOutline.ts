import { useEffect, useMemo, useState, type RefObject } from "react";
import { extractOutline } from "../utils/outline";

/* ── Heading scroll-spy ──
   An IntersectionObserver watches the h1/h2/h3 lines inside the
   markdown editor and reports the topmost one in view, so the outline
   can highlight "you are here" while she scrolls a long note. Re-wires
   only when the heading SET changes, never per keystroke. */
export function useNoteOutline(content: string, scrollRef: RefObject<HTMLDivElement | null>): number | null {
  const [activeHeadingLine, setActiveHeadingLine] = useState<number | null>(null);

  const headingsSignature = useMemo(
    () =>
      extractOutline(content)
        .map((o) => `${o.line}-${o.level}`)
        .join(","),
    [content]
  );

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    if (typeof IntersectionObserver === "undefined") return;
    let raf = 0;
    const visible = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const lineIdx = parseInt((entry.target as HTMLElement).dataset.line || "", 10);
          if (Number.isNaN(lineIdx)) continue;
          if (entry.isIntersecting) visible.set(lineIdx, entry.boundingClientRect.top);
          else visible.delete(lineIdx);
        }
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          if (visible.size === 0) {
            setActiveHeadingLine(null);
            return;
          }
          let best = Infinity;
          for (const lineIdx of visible.keys()) if (lineIdx < best) best = lineIdx;
          setActiveHeadingLine(best === Infinity ? null : best);
        });
      },
      { root: scrollEl, rootMargin: "0px 0px -88% 0px", threshold: 0 }
    );

    const editorRoot = scrollEl.querySelector(".mde-root");
    if (!editorRoot) {
      return () => {
        observer.disconnect();
        if (raf) cancelAnimationFrame(raf);
      };
    }
    const wireUp = () => {
      observer.disconnect();
      visible.clear();
      editorRoot.querySelectorAll(".mde-line--h1, .mde-line--h2, .mde-line--h3").forEach((h) => observer.observe(h));
    };
    wireUp();
    const mut = new MutationObserver(wireUp);
    mut.observe(editorRoot, { childList: true, subtree: false });
    return () => {
      mut.disconnect();
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [headingsSignature, scrollRef]);

  return activeHeadingLine;
}
