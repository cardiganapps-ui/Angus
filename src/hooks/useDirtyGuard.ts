import { useRef } from "react";
import { isDirty, type DirtySnapshot } from "../utils/dirty";

/* ── useDirtyGuard ──
   Feeds a sheet's current field values in, gets back "she has unsaved
   edits". Pass the result to <Sheet dirty={…}> and every dismissal path
   — scrim tap, Escape, handle flick, the close X — asks before throwing
   the form away.

   Only the values that get SAVED belong in the snapshot. Open/closed
   sections, which nested sheet is up, a scope radio that changes what
   Guardar does — none of that is typing she can lose, and including it
   would arm the confirm over a tap she meant. */
export function useDirtyGuard<T extends DirtySnapshot>(current: T): boolean {
  /* The values the sheet opened with, pinned for its whole life. A ref
     rather than state: re-seeding this from a later render would make
     her edits read as clean the moment an unrelated store update
     re-rendered the sheet underneath her. */
  const opened = useRef(current);
  return isDirty(opened.current, current);
}
