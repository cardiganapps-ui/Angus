import { useRef, useState } from "react";
import { Sheet } from "./Sheet";
import { Icon } from "./Icon";
import { useDocuments, type DocumentLinks } from "../hooks/useDocuments";
import { useToast } from "../context/ToastContext";
import { ACCEPT_UPLOAD, StorageError, formatFileSize, storageErrorMessage } from "../lib/files";
import { haptic } from "../lib/haptics";

const MAX_BATCH = 10;

interface Item {
  key: string;
  file: File;
  progress: number;
  state: "queued" | "uploading" | "done" | "error";
  error?: string;
}

/* ── UploadSheet ──
   Pick files (or drop them on desktop); each one uploads right away
   with its own progress bar. Up to 10 per batch. When storage isn't
   configured yet the sheet says so instead of spinning. */
export function UploadSheet({ links, onClose, onUploaded }: { links: DocumentLinks; onClose: () => void; onUploaded?: (count: number) => void }) {
  const { upload } = useDocuments();
  const { showSuccess } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const uploading = items.some((i) => i.state === "uploading" || i.state === "queued");
  const done = items.filter((i) => i.state === "done").length;

  function patch(key: string, p: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...p } : i)));
  }

  async function addFiles(list: File[]) {
    const room = Math.max(0, MAX_BATCH - items.length);
    const files = list.slice(0, room);
    if (files.length === 0) return;
    const next: Item[] = files.map((file) => ({ key: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`, file, progress: 0, state: "queued" }));
    setItems((prev) => [...prev, ...next]);
    for (const item of next) {
      patch(item.key, { state: "uploading" });
      try {
        await upload({ file: item.file, links, onProgress: (f) => patch(item.key, { progress: f }) });
        patch(item.key, { state: "done", progress: 1 });
        haptic.success();
      } catch (err) {
        if (err instanceof StorageError && err.code === "not_configured") setNotConfigured(true);
        patch(item.key, { state: "error", error: storageErrorMessage(err) });
        haptic.warn();
      }
    }
  }

  function finish() {
    if (done > 0) {
      showSuccess(done === 1 ? "Archivo guardado" : `${done} archivos guardados`);
      onUploaded?.(done);
    }
    onClose();
  }

  return (
    <Sheet
      title="Subir archivos"
      onClose={uploading ? null : onClose}
      footer={
        <div className="sheet-actions">
          <button type="button" className="btn btn-primary" onClick={finish} disabled={uploading}>
            {uploading ? "Subiendo…" : done > 0 ? "Listo" : "Cerrar"}
          </button>
        </div>
      }
    >
      {notConfigured ? (
        <div className="empty-state" style={{ paddingTop: 8 }}>
          <span className="empty-state-icon">
            <Icon name="alert" size={20} />
          </span>
          <div className="empty-state-title">Almacenamiento pendiente</div>
          <div className="empty-state-body">El espacio para archivos todavía no está conectado. Tus notas, tareas y cursos siguen funcionando; los archivos llegarán en cuanto se configure.</div>
        </div>
      ) : (
        <button
          type="button"
          className={"upload-drop btn-tap" + (dragOver ? " is-over" : "")}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              setDragOver(true);
            }
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void addFiles(Array.from(e.dataTransfer.files));
          }}
          disabled={items.length >= MAX_BATCH}
        >
          <span className="upload-drop-icon">
            <Icon name="upload" size={22} strokeWidth={2.2} />
          </span>
          <span className="upload-drop-title">Elige fotos o archivos</span>
          <span className="upload-drop-body">PDF, imágenes, Word, Excel, texto · hasta 25 MB cada uno · {MAX_BATCH} por vez</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_UPLOAD}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void addFiles(files);
        }}
      />

      {items.length > 0 && (
        <div className="money-list" style={{ marginTop: 14 }}>
          {items.map((it) => (
            <div key={it.key} className="row-item upload-item" style={{ cursor: "default" }}>
              <span className={`doc-icon doc-icon--${it.file.type.startsWith("image/") ? "image" : "file"}`}>
                <Icon name={it.state === "done" ? "check" : it.state === "error" ? "alert" : it.file.type.startsWith("image/") ? "image" : "file"} size={18} strokeWidth={it.state === "done" ? 2.6 : 2} />
              </span>
              <div className="row-content">
                <div className="row-title">{it.file.name}</div>
                {it.state === "error" ? (
                  <div className="row-sub task-due--overdue">{it.error}</div>
                ) : it.state === "done" ? (
                  <div className="row-sub">{formatFileSize(it.file.size)} · guardado</div>
                ) : (
                  <div className="upload-bar" aria-label="Progreso">
                    <span className="upload-bar-fill" style={{ transform: `scaleX(${Math.max(0.03, it.progress)})` }} />
                  </div>
                )}
              </div>
              {it.state === "error" && (
                <button type="button" className="btn btn-ghost btn-mini" onClick={() => void addFiles([it.file])}>
                  Reintentar
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
