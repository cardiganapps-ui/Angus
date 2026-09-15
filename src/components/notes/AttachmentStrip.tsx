import { useCallback, useState } from "react";
import type { NoteAttachment } from "../../types";
import type { TileState } from "../../hooks/useNoteAttachments";
import { useEscape } from "../../hooks/useEscape";
import { Icon } from "../Icon";
import { haptic } from "../../lib/haptics";

/* ── AttachmentStrip ──
   The note's images as thumbnails under the body. Tap one to see it
   full screen; the × removes it (object, row, and cover if it was). */
export function AttachmentStrip({
  rows,
  tiles,
  retryTile,
  onDelete
}: {
  rows: NoteAttachment[];
  tiles: Record<string, TileState>;
  retryTile: (id: string) => void;
  onDelete: (row: NoteAttachment) => Promise<void>;
}) {
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const closeLightbox = useCallback(() => setLightboxId(null), []);
  useEscape(lightboxId ? closeLightbox : null);

  if (lightboxId && !rows.some((r) => r.id === lightboxId)) setLightboxId(null);
  if (rows.length === 0) return null;
  const lightbox = lightboxId ? tiles[lightboxId] : null;

  return (
    <>
      <div className="mde-attach-strip" aria-label="Imágenes de la nota">
        {rows.map((row) => {
          const tile = tiles[row.id];
          return (
            <div key={row.id} className="mde-attach-tile">
              {tile?.url ? (
                <button type="button" className="mde-attach-thumb btn-tap" onClick={() => setLightboxId(row.id)} aria-label="Ver imagen">
                  <img src={tile.url} alt="" />
                </button>
              ) : tile?.failed ? (
                <button type="button" className="mde-attach-thumb mde-attach-failed btn-tap" onClick={() => retryTile(row.id)} aria-label="Reintentar">
                  <span aria-hidden="true">↻</span>
                </button>
              ) : (
                <div className="mde-attach-thumb mde-attach-loading" aria-hidden="true" />
              )}
              <button
                type="button"
                className="mde-attach-delete btn-tap"
                onClick={() => {
                  haptic.warn();
                  void onDelete(row);
                }}
                aria-label="Quitar imagen"
              >
                <Icon name="x" size={12} strokeWidth={2.6} />
              </button>
            </div>
          );
        })}
      </div>
      {lightbox?.url && (
        <div
          className="mde-attach-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Imagen"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeLightbox();
          }}
        >
          <button type="button" className="mde-attach-lightbox-close" onClick={closeLightbox} aria-label="Cerrar" autoFocus>
            <Icon name="x" size={18} />
          </button>
          <img src={lightbox.url} alt="" />
        </div>
      )}
    </>
  );
}
