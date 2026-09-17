import { useState } from "react";
import { Sheet } from "./Sheet";
import { SheetActions } from "./SheetActions";
import { useDirtyGuard } from "../hooks/useDirtyGuard";
import { prefersAutoFocus } from "../lib/device";

/* ── SettingsFieldSheet ──
   One text or money field in a sheet: label, input, Guardar. Used by
   Ajustes for names and amounts so every edit follows the same gesture
   as everything else in the app. */
export function SettingsFieldSheet({
  title,
  label,
  value,
  placeholder,
  kind = "text",
  help,
  onSave,
  onClose
}: {
  title: string;
  label: string;
  value: string;
  placeholder?: string;
  kind?: "text" | "money";
  help?: string;
  onSave: (next: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const dirty = useDirtyGuard({ draft });
  const trimmed = draft.trim();
  const canSave =
    kind === "money" ? trimmed === "" || Number(trimmed) >= 0 : trimmed !== value.trim();

  function save() {
    if (!canSave) return;
    void onSave(trimmed);
    onClose();
  }

  return (
    <Sheet
      title={title}
      onClose={onClose}
      dirty={dirty}
      discardText={`¿Descartar los cambios? «${label}» se queda como estaba.`}
      footer={<SheetActions canSave={canSave} submitting={false} onSave={save} confirmText="" />}
    >
      <div className="input-group">
        <label className="input-label" htmlFor="settings-field">
          {label}
        </label>
        {kind === "money" ? (
          <div className="money-input-wrap">
            <span className="money-input-symbol">$</span>
            <input
              id="settings-field"
              className="input money-input"
              type="number"
              inputMode="decimal"
              value={draft}
              placeholder={placeholder ?? "0"}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              autoFocus={prefersAutoFocus()}
            />
          </div>
        ) : (
          <input
            id="settings-field"
            className="input"
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            autoFocus={prefersAutoFocus()}
          />
        )}
        {help && <div className="input-help">{help}</div>}
      </div>
    </Sheet>
  );
}
