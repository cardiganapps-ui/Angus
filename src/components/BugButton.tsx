import { Icon } from "./Icon";
import { haptic } from "../lib/haptics";

/* ── The little bug ──
   Bottom-left of every signed-in screen, opposite the +. One tap opens
   Cuéntale a Diego with the current screen already known. Small and
   quiet on purpose: it should be findable the moment something goes
   wrong and invisible the rest of the time. Hidden with the FAB while a
   sheet is open (base.css, body:has(.sheet-overlay)). */
export function BugButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="bug-fab btn-tap"
      aria-label="Reportar una falla o sugerir algo"
      title="Cuéntale a Diego"
      onClick={() => {
        haptic.tap();
        onClick();
      }}
    >
      <Icon name="bug" size={18} strokeWidth={2} />
    </button>
  );
}
