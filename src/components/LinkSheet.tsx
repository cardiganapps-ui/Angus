import { useState } from "react";
import { Sheet } from "./Sheet";
import { SheetActions } from "./SheetActions";
import { useDocuments, type DocumentLinks } from "../hooks/useDocuments";
import { useToast } from "../context/ToastContext";
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

  const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : url.trim() ? `https://${url.trim()}` : "";
  let valid = false;
  try {
    valid = !!normalized && !!new URL(normalized).hostname.includes(".");
  } catch {
    valid = false;
  }

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
    <Sheet title="Agregar enlace" onClose={submitting ? null : onClose} footer={<SheetActions canSave={valid} submitting={submitting} onSave={() => void save()} confirmText="" />}>
      <div className="input-group">
        <label className="input-label" htmlFor="link-url">Dirección</label>
        <input id="link-url" className="input" type="url" inputMode="url" autoCapitalize="none" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" autoFocus />
        <div className={`input-error-msg ${url.trim() && !valid ? "is-visible" : ""}`}>Escribe una dirección completa, como youtube.com/…</div>
      </div>
      <div className="input-group">
        <label className="input-label" htmlFor="link-name">Nombre (opcional)</label>
        <input id="link-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Video de la clase, lectura, referencia…" />
      </div>
    </Sheet>
  );
}
