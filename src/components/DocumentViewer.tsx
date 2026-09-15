import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Document } from "../types";
import { fileUrl, formatFileSize, isImageMime, isPdfMime } from "../lib/files";
import { useEscape } from "../hooks/useEscape";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { formatShort } from "../utils/dates";
import { Icon } from "./Icon";
import { haptic } from "../lib/haptics";

/* ── DocumentViewer ──
   A full-height surface: images fill it (pinch-zoom via native
   scrolling), PDFs open in a frame, anything else offers a download.
   Delete is a two-tap action in the footer. */
export function DocumentViewer({ doc, onClose, onDelete }: { doc: Document; onClose: () => void; onDelete?: (doc: Document) => Promise<void> }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exiting, setExiting] = useState(false);
  const image = doc.kind === "file" && isImageMime(doc.mime);
  const pdf = doc.kind === "file" && isPdfMime(doc.mime);

  useEffect(() => {
    if (doc.kind === "link") {
      setUrl(doc.url);
      return;
    }
    if (!doc.r2Path) return;
    let alive = true;
    void fileUrl(doc.r2Path, doc.name).then((u) => {
      if (!alive) return;
      if (u) setUrl(u);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [doc]);

  const close = () => {
    if (busy) return;
    setExiting(true);
    setTimeout(onClose, 250);
  };
  useEscape(busy ? null : close);
  const trapRef = useFocusTrap(true);

  const meta = [doc.kind === "link" && doc.url ? doc.url : formatFileSize(doc.sizeBytes), formatShort(doc.createdAt)].filter(Boolean).join(" · ");

  return createPortal(
    <div ref={trapRef as React.RefObject<HTMLDivElement>} className={"doc-viewer" + (exiting ? " doc-viewer--exit" : "")} role="dialog" aria-modal="true" aria-label={doc.name}>
      <div className="doc-viewer-head">
        <button type="button" className="mde-back btn-tap" onClick={close} disabled={busy}>
          <Icon name="chevron-left" size={18} strokeWidth={2.4} />
          <span>Volver</span>
        </button>
        <div className="doc-viewer-title-wrap">
          <div className="doc-viewer-title">{doc.name}</div>
          <div className="doc-viewer-meta">{meta}</div>
        </div>
      </div>

      <div className={"doc-viewer-body scroll-bounce" + (image ? " doc-viewer-body--image" : "")}>
        {doc.kind === "link" ? (
          <div className="doc-viewer-fallback">
            <span className="empty-state-icon">
              <Icon name="link" size={20} />
            </span>
            <div className="empty-state-title">{doc.name}</div>
            <div className="empty-state-body">{doc.url}</div>
            <a className="btn btn-primary" href={doc.url ?? "#"} target="_blank" rel="noopener noreferrer">
              Abrir enlace
            </a>
          </div>
        ) : failed ? (
          <div className="doc-viewer-fallback">
            <span className="empty-state-icon">
              <Icon name="alert" size={20} />
            </span>
            <div className="empty-state-title">No se pudo abrir</div>
            <div className="empty-state-body">Revisa tu conexión o que el almacenamiento esté configurado, e inténtalo de nuevo.</div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setFailed(false);
                if (doc.r2Path) void fileUrl(doc.r2Path, doc.name).then((u) => (u ? setUrl(u) : setFailed(true)));
              }}
            >
              Reintentar
            </button>
          </div>
        ) : !url ? (
          <div className="doc-viewer-loading">
            <div className="sk-bar" style={{ width: "60%", height: 180, borderRadius: "var(--radius)" }} />
          </div>
        ) : image ? (
          <img className="doc-viewer-img" src={url} alt={doc.name} onError={() => setFailed(true)} />
        ) : pdf ? (
          <iframe className="doc-viewer-frame" src={url} title={doc.name} sandbox="allow-same-origin allow-scripts" />
        ) : (
          <div className="doc-viewer-fallback">
            <span className="empty-state-icon">
              <Icon name="file" size={20} />
            </span>
            <div className="empty-state-title">{doc.name}</div>
            <div className="empty-state-body">Este tipo de archivo no se puede previsualizar aquí.</div>
            <a className="btn btn-primary" href={url} target="_blank" rel="noopener noreferrer">
              Descargar
            </a>
          </div>
        )}
      </div>

      <div className="doc-viewer-foot">
        {url && doc.kind === "file" && (
          <a className="btn btn-secondary btn-mini" href={url} target="_blank" rel="noopener noreferrer">
            <Icon name="download" size={16} /> Abrir
          </a>
        )}
        {onDelete &&
          (confirm ? (
            <button
              type="button"
              className="btn btn-danger btn-mini"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                haptic.warn();
                try {
                  await onDelete(doc);
                  onClose();
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Eliminando…" : "Sí, eliminar"}
            </button>
          ) : (
            <button type="button" className="btn btn-ghost btn-ghost--danger btn-mini" onClick={() => setConfirm(true)}>
              <Icon name="trash" size={16} /> Eliminar
            </button>
          ))}
      </div>
    </div>,
    document.body
  );
}
