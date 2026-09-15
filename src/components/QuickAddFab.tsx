import { useState } from "react";
import { Icon } from "./Icon";
import { useEscape } from "../hooks/useEscape";
import { useApp } from "../context/AppContext";
import { QUICK_ACTION } from "../data/constants";
import type { QuickAction } from "../types";
import { haptic } from "../lib/haptics";

/* ── QuickAddFab ──
   The Hoy FAB: one tap fans out the things she creates most, in the
   order from settings.quickActions. Uses the speed-dial vocabulary
   already in components.css (.fab-overlay / .fab-menu / .fab-action). */
export function QuickAddFab({ onPick }: { onPick: (action: QuickAction) => void }) {
  const { settings } = useApp();
  const [open, setOpen] = useState(false);
  useEscape(open ? () => setOpen(false) : null);

  const actions = settings.quickActions
    .map((value) => QUICK_ACTION.find((a) => a.value === value))
    .filter((a): a is (typeof QUICK_ACTION)[number] => !!a);

  function pick(action: QuickAction) {
    haptic.tap();
    setOpen(false);
    onPick(action);
  }

  return (
    <>
      {open && (
        <>
          <div className="fab-overlay" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="fab-menu" role="menu" aria-label="Crear">
            {[...actions].reverse().map((action, i) => (
              <button
                key={action.value}
                type="button"
                role="menuitem"
                className="fab-action"
                style={{ animationDelay: `${(actions.length - 1 - i) * 35}ms` }}
                onClick={() => pick(action.value)}
              >
                <span className="fab-action-label">{action.label}</span>
                <span className="fab-action-icon">
                  <Icon name={action.icon} size={18} />
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      <button
        type="button"
        className={`fab ${open ? "fab-open" : ""}`}
        aria-label={open ? "Cerrar" : "Crear"}
        aria-expanded={open}
        onClick={() => {
          haptic.tap();
          setOpen((v) => !v);
        }}
      >
        <Icon name="plus" size={24} strokeWidth={2.2} />
      </button>
    </>
  );
}
