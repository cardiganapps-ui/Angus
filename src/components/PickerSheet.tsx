import { useRef, useState } from "react";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { haptic } from "../lib/haptics";

export interface PickerOption {
  value: string;
  label: string;
}

const SEARCH_THRESHOLD = 8;

/* ── PickerSheet ──
   The option list behind PickerField: "Ninguno" first, then every
   option as a .row-item with an accent check on the selected row. Above
   SEARCH_THRESHOLD options a search input filters by name (no
   autofocus — popping the keyboard over a picker is jarring).
   Selecting fires a light haptic, updates the field, and closes
   through Sheet's normal animated exit via `closeRef`. */
export function PickerSheet({
  title,
  options,
  value,
  placeholder,
  onSelect,
  onClose
}: {
  title: string;
  options: PickerOption[];
  value: string;
  placeholder: string;
  onSelect: (next: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const closeRef = useRef<(() => void) | null>(null);

  const searchable = options.length > SEARCH_THRESHOLD;
  const q = query.trim().toLocaleLowerCase();
  const visible = q ? options.filter((o) => o.label.toLocaleLowerCase().includes(q)) : options;
  const rows: PickerOption[] = q ? visible : [{ value: "", label: placeholder }, ...visible];

  function choose(next: string) {
    haptic.tap();
    onSelect(next);
    (closeRef.current ?? onClose)();
  }

  return (
    <Sheet title={title} onClose={onClose} closeRef={closeRef}>
      {searchable && (
        <div className="input-group">
          <input
            className="input"
            type="search"
            inputMode="search"
            placeholder="Buscar…"
            aria-label={`Buscar en ${title}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}
      <div className="card picker-list" role="listbox" aria-label={title}>
        {rows.length === 0 ? (
          <div className="picker-empty">Sin resultados para “{query.trim()}”.</div>
        ) : (
          rows.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value || "__none"}
                type="button"
                role="option"
                aria-selected={active}
                className={`row-item picker-row ${active ? "picker-row--active" : ""}`}
                onClick={() => choose(opt.value)}
              >
                <div className="row-content">
                  <div className={`row-title ${opt.value ? "" : "picker-row-none"}`}>{opt.label}</div>
                </div>
                {active && (
                  <span className="picker-check" aria-hidden="true">
                    <Icon name="check" size={18} strokeWidth={2.4} />
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </Sheet>
  );
}
