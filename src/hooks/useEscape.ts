import { useEffect } from "react";

// Single document-level keydown listener + a stack of registered
// handlers. When ESC is pressed, only the most recently mounted
// (topmost) handler fires — so closing a picker sheet opened over a
// form sheet doesn't ALSO close the sheet underneath. Previously each
// useEscape call attached its own document listener and they all
// fired on a single keypress, collapsing every open modal at once.
//
// Keyboard only. The OS/browser back gesture is NOT wired to this
// stack: it walks the hash history in useNavigation, so a back press
// with a sheet open changes the screen behind it instead of dismissing
// it. Making back dismiss sheets means owning a history entry per
// layer, and the programmatic-close path (history.back()) is
// indistinguishable from a real back press without a re-entrancy
// guard — plus a submitting sheet registers nothing here (see below),
// so a back press mid-submit would dismiss the layer underneath it.
// Not worth the risk to her data; handle-drag, scrim tap, the X and
// ESC are the dismissal vocabulary.
const escapeStack: Array<() => void> = [];
let listenerAttached = false;

function ensureListener() {
  if (listenerAttached || typeof document === "undefined") return;
  listenerAttached = true;
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const top = escapeStack[escapeStack.length - 1];
    if (top) top();
  });
}

// A sheet that can't close right now (submitting) passes null, which
// registers nothing — so ESC falls through to whatever is underneath
// rather than being swallowed. Fine for a keypress; it is also the
// reason back-gesture dismissal isn't wired here.
export function useEscape(onClose: (() => void) | null | undefined) {
  useEffect(() => {
    if (!onClose) return;
    ensureListener();
    escapeStack.push(onClose);
    return () => {
      // Use lastIndexOf so re-renders that swap the same callback
      // identity remove the right entry (top-of-stack).
      const idx = escapeStack.lastIndexOf(onClose);
      if (idx >= 0) escapeStack.splice(idx, 1);
    };
  }, [onClose]);
}
