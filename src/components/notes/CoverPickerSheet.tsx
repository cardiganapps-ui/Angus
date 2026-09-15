import { useState } from "react";
import type { NoteAttachment } from "../../types";
import type { TileState } from "../../hooks/useNoteAttachments";
import { Sheet } from "../Sheet";
import { Icon } from "../Icon";
import { haptic } from "../../lib/haptics";

/* ── CoverPickerSheet ──
   Pick one of the note's images as its cover. Tapping a thumb is the
   confirm; "Quitar portada" clears it. */
export function CoverPickerSheet({
  rows,
  tiles,
  currentCoverId,
  onPick,
  onClear,
  onRequestAttach,
  onClose
}: {
  rows: NoteAttachment[];
  tiles: Record<string, TileState>;
  currentCoverId: string | null;
  onPick: (id: string) => Promise<unknown>;
  onClear: () => Promise<unknown>;
  onRequestAttach: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function pick(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await onPick(id);
      haptic.success();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title="Portada"
      onClose={busy ? null : onClose}
      footer={
        currentCoverId ? (
          <div className="sheet-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onClear();
                  haptic.tap();
                  onClose();
                } finally {
                  setBusy(false);
                }
              }}
            >
              Quitar portada
            </button>
          </div>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <div className="empty-state" style={{ paddingTop: 4 }}>
          <span className="empty-state-icon">
            <Icon name="image" size={20} />
          </span>
          <div className="empty-state-title">Sin imágenes todavía</div>
          <div className="empty-state-body">Adjunta una foto a la nota y podrás usarla de portada.</div>
          <button
            type="button"
            className="btn btn-primary btn-mini"
            onClick={() => {
              onClose();
              onRequestAttach();
            }}
          >
            Adjuntar imagen
          </button>
        </div>
      ) : (
        <div className="cover-grid">
          {rows.map((row) => {
            const tile = tiles[row.id];
            const current = row.id === currentCoverId;
            return (
              <button key={row.id} type="button" className={"cover-tile btn-tap" + (current ? " is-current" : "")} disabled={busy || !tile?.url} aria-pressed={current} onClick={() => void pick(row.id)}>
                {tile?.url && <img src={tile.url} alt="" />}
                {current && (
                  <span className="cover-tile-check">
                    <Icon name="check" size={12} strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
