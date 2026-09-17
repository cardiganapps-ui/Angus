import { Icon } from "./Icon";
import { haptic } from "../lib/haptics";

/* ── The little bug ──
   In the topbar, right after the menu / back chevron, on every
   signed-in screen. One tap opens Cuéntale a Diego with the current
   screen already known. Same 44px pill as the magnifier on the other
   side; quiet on purpose — findable the moment something goes wrong,
   invisible the rest of the time. */
export function BugButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="topbar-search topbar-bug btn-tap"
      aria-label="Reportar una falla o sugerir algo"
      title="Cuéntale a Diego"
      onClick={() => {
        haptic.tap();
        onClick();
      }}
    >
      <Icon name="bug" size={20} strokeWidth={2} />
    </button>
  );
}
