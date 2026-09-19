import { useRef, useState } from "react";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { haptic } from "../lib/haptics";

export interface PickerOption {
  value: string;
  label: string;
  /** The bare name when `label` is decorated ("Expo · 12 sep"), so a
      typed name still matches an existing row instead of offering to
      create its twin. */
  name?: string;
}

const SEARCH_THRESHOLD = 8;

/* ── PickerSheet ──
   The option list behind PickerField: "Ninguno" first, then every
   option as a .row-item with an accent check on the selected row. Above
   SEARCH_THRESHOLD options a search input filters by name (no
   autofocus — popping the keyboard over a picker is jarring).
   Selecting fires a light haptic, updates the field, and closes
   through Sheet's normal animated exit via `closeRef`.

   `onCreate` turns the picker into a way OUT of the picker: the search
   box is always shown, and whatever she typed is offered as "Crear
   «…»". A client who isn't in her agenda yet used to be a dead end in
   every sheet that references one — she could only pick from what
   already existed, or leave to build a whole profile first. Now the
   caller creates the row right here (hooks/useQuickCreate.ts: name +
   context defaults, nothing else asked) and answers with its id; the
   picker selects it and closes. A null answer means the store refused
   and has already said why — the sheet stays open with her text intact
   so she can try again or pick something else. */
export function PickerSheet({
  title,
  options,
  value,
  placeholder,
  onSelect,
  onClose,
  onCreate,
  createLabel = "Crear nuevo"
}: {
  title: string;
  options: PickerOption[];
  value: string;
  placeholder: string;
  onSelect: (next: string) => void;
  onClose: () => void;
  /** Create from what she typed; resolve the new id, or null when refused. */
  onCreate?: (typed: string) => Promise<string | null>;
  /** Label for the create row when the search box is empty. */
  createLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const closeRef = useRef<(() => void) | null>(null);

  const searchable = options.length > SEARCH_THRESHOLD || !!onCreate;
  const typed = query.trim();
  const q = typed.toLocaleLowerCase();
  const visible = q ? options.filter((o) => o.label.toLocaleLowerCase().includes(q)) : options;
  const rows: PickerOption[] = q ? visible : [{ value: "", label: placeholder }, ...visible];
  // No point offering "Crear «Ana»" when Ana is already one tap away.
  const exact = q.length > 0 && options.some((o) => (o.name ?? o.label).trim().toLocaleLowerCase() === q);
  const canCreate = /[\p{L}\p{N}]/u.test(typed);
  const showCreate = !!onCreate && !exact;

  function choose(next: string) {
    if (creating) return;
    haptic.tap();
    onSelect(next);
    (closeRef.current ?? onClose)();
  }

  async function create() {
    if (!onCreate || creating || !canCreate) return;
    haptic.tap();
    setCreating(true);
    const id = await onCreate(typed);
    setCreating(false);
    if (!id) return;
    onSelect(id);
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
            placeholder={onCreate ? "Buscar o escribir un nombre…" : "Buscar…"}
            aria-label={`Buscar en ${title}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}
      {/* Outside the listbox on purpose: it doesn't pick an option, it
          leaves to make one, and a non-option child breaks the role. */}
      {showCreate && (
        <div className="card picker-create">
          <button
            type="button"
            className="row-item picker-row"
            onClick={() => void create()}
            disabled={!canCreate || creating}
            aria-busy={creating}
          >
            <span className="picker-create-icon" aria-hidden="true">
              <Icon name="plus" size={16} strokeWidth={2.4} />
            </span>
            <div className="row-content">
              <div className="row-title">
                {creating ? "Creando…" : canCreate ? `Crear “${typed}”` : createLabel}
              </div>
              {!canCreate && !creating && (
                <div className="row-sub">Escribe el nombre arriba y se guarda aquí mismo.</div>
              )}
            </div>
          </button>
        </div>
      )}
      <div className="card picker-list" role="listbox" aria-label={title}>
        {rows.length === 0 ? (
          showCreate ? null : (
            <div className="picker-empty">Sin resultados para “{typed}”.</div>
          )
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
