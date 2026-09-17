/* ── Device facts the UI adapts to ── */

/** True when the primary input is touch (a phone or tablet). */
export function isCoarsePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

/* A sheet that auto-focuses its first field is a courtesy on a laptop
   and an ambush on a phone: the keyboard slides up over a surface that
   is still sliding in, covers the form she has not read yet, and moves
   the button she was about to tap. So no field takes focus on its own
   on touch devices — she taps the one she wants — and the desktop
   convenience stays. */
export function prefersAutoFocus(): boolean {
  return !isCoarsePointer();
}
