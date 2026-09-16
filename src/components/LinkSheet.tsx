import { useId, useState } from "react";
import { Sheet } from "./Sheet";
import { SheetActions } from "./SheetActions";
import { useDocuments, type DocumentLinks } from "../hooks/useDocuments";
import { useToast } from "../context/ToastContext";
import { useDirtyGuard } from "../hooks/useDirtyGuard";
import { domId } from "../utils/id";
import { haptic } from "../lib/haptics";

/* ── LinkSheet ──
   A URL she wants to keep with the course or tarea: a video, a PDF
   someone shared, a reference. Stored as a document of kind "link". */
export function LinkSheet({ links, onClose }: { links: DocumentLinks; onClose: () => void }) {
  const { addLink } = useDocuments();
  const { showSuccess, showToast } = useToast();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const dirty = useDirtyGuard({ url, name });
  const errorId = `link-url-error-${domId(useId())}`;

  const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : url.trim() ? `https://${url.trim()}` : "";
  let valid = false;
  try {
    valid = !!normalized && !!new URL(normalized).hostname.includes(".");
  } catch {
    valid = false;
  }
  const showError = !!url.trim() && !valid;

  async function save() {
    if (!valid) return;
    setSubmitting(true);
    const doc = await addLink({ url: normalized, name, links });
    if (!doc) {
      setSubmitting(false);
      haptic.warn();
      showToast("No se pudo guardar el enlace", "error");
      return;
    }
    haptic.success();
    showSuccess("Enlace guardado");
    onClose();
  }

  return (
    <Sheet
      title="Agregar enlace"
      onClose={submitting ? null : onClose}
      dirty={dirty}
      discardText="¿Descartar? El enlace no se guarda."
      footer={<SheetActions canSave={valid} submitting={submitting} onSave={() => void save()} confirmText="" />}
    >
      <div className="input-group">
        <label className="input-label" htmlFor="link-url">Dirección</label>
        <input
          id="link-url"
          className={`input ${showError ? "input-error" : ""}`}
          type="url"
          inputMode="url"
          autoCapitalize="none"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          aria-invalid={showError || undefined}
          aria-describedby={errorId}
          autoFocus
        />
        {/* Rendered unconditionally: .input-error-msg reserves its own
            line, and role=alert only announces text that APPEARS in a
            live region that was already there. */}
        <div className={`input-error-msg ${showError ? "is-visible" : ""}`} id={errorId} role="alert">
          {showError ? "Escribe una dirección completa, como youtube.com/…" : ""}
        </div>
      </div>
      <div className="input-group">
        <label className="input-label" htmlFor="link-name">Nombre (opcional)</label>
        <input id="link-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Video de la clase, lectura, referencia…" />
      </div>
    </Sheet>
  );
}
