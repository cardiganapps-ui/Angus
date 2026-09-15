import { useState } from "react";

/* ── SheetActions ──
   The shared sticky-footer content for the entity sheets: Guardar
   (+ Eliminar when editing) that swaps to "¿Eliminar…?" + Sí / Cancelar.

   Both states are rendered into the SAME grid cell
   (.sheet-actions > * { grid-area: 1 / 1 }) so the footer's height is
   the max of the two and the panel never jumps on swap; the inactive
   state is visibility: hidden + inert. The active state is keyed so
   its fade-and-lift keyframe (sheetActionsIn) replays on every swap.
   Buttons are bottom-aligned in the cell, so Guardar sits exactly
   where "Sí, eliminar" lands and Eliminar where Cancelar does — the
   swap reads as labels changing in place, not a layout reshuffle. */
export function SheetActions({
  canSave,
  submitting,
  onSave,
  onDelete,
  confirmText
}: {
  canSave: boolean;
  submitting: boolean;
  onSave: () => void;
  /** Present only when editing an existing item. */
  onDelete?: () => void;
  confirmText: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const canDelete = !!onDelete;

  // `ghost` renders the inactive twin: buttons disabled so the focus
  // trap's `button:not([disabled])` scan skips them (visibility:hidden
  // alone leaves them in the Tab wrap-around math).
  const actions = (ghost: boolean) => (
    <div className="sheet-actions-state" key="actions">
      <button type="button" className="btn btn-primary" onClick={onSave} disabled={ghost || !canSave || submitting}>
        {submitting ? "Guardando…" : "Guardar"}
      </button>
      {canDelete && (
        <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)} disabled={ghost || submitting}>
          Eliminar
        </button>
      )}
    </div>
  );

  const confirm = (ghost: boolean) => (
    <div className="sheet-actions-state" key="confirm">
      <div className="input-help sheet-actions-question">{confirmText}</div>
      <button type="button" className="btn btn-danger" onClick={onDelete} disabled={ghost || submitting}>
        Sí, eliminar
      </button>
      <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)} disabled={ghost || submitting}>
        Cancelar
      </button>
    </div>
  );

  if (!canDelete) return <div className="sheet-actions">{actions(false)}</div>;

  return (
    <div className="sheet-actions">
      {/* Inactive twin: reserves height only, never interactive. */}
      <div className="sheet-actions-ghost" aria-hidden="true" inert>
        {confirming ? actions(true) : confirm(true)}
      </div>
      {confirming ? confirm(false) : actions(false)}
    </div>
  );
}
