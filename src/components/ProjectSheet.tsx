import { useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { Project, ProjectStatus } from "../types";
import { PROJECT_STATUS } from "../data/constants";
import { Sheet } from "./Sheet";
import { SheetActions } from "./SheetActions";
import { SegmentedControl } from "./SegmentedControl";
import { PickerField } from "./PickerField";
import { makeId } from "../utils/id";
import { todayISO } from "../utils/dates";
import { projectMargins } from "../utils/accounting";
import { formatMXNShort, formatMXNShortSigned } from "../utils/money";
import { haptic } from "../lib/haptics";

const STATUS_ITEMS = PROJECT_STATUS.map((s) => ({ k: s.value, l: s.label }));

export function ProjectSheet({
  project,
  onClose
}: {
  project: Project | null;
  onClose: () => void;
}) {
  const { addProject, updateProject, removeProject, contacts, sales, payments, expenses } =
    useApp();
  const { showSuccess } = useToast();
  const [title, setTitle] = useState(project?.title ?? "");
  const [medium, setMedium] = useState(project?.medium ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "idea");
  const [startDate, setStartDate] = useState(project?.startDate ?? "");
  const [dueDate, setDueDate] = useState(project?.dueDate ?? "");
  const [price, setPrice] = useState(project?.price?.toString() ?? "");
  const [contactId, setContactId] = useState(project?.contactId ?? "");
  const [notes, setNotes] = useState(project?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const safeClose = submitting ? null : onClose;
  const canSave = title.trim().length > 0;
  const contactOptions = [...contacts]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: c.name }));
  // Only for a piece that already has money attached — a brand-new one
  // has nothing to report, and an empty band would just add weight.
  const economics = project
    ? projectMargins([project.id], sales, payments, expenses)[0]?.economics
    : undefined;

  function handleSave() {
    if (!canSave) return;
    setSubmitting(true);
    const patch = {
      title: title.trim(),
      medium: medium.trim(),
      status,
      startDate: startDate || null,
      dueDate: dueDate || null,
      price: price ? Number(price) : null,
      contactId: contactId || null,
      notes: notes.trim()
    };
    if (project) {
      updateProject(project.id, patch);
    } else {
      addProject({ id: makeId(), createdAt: todayISO(), ...patch });
    }
    haptic.success();
    showSuccess(project ? "Proyecto actualizado" : "Proyecto creado");
    onClose();
  }

  function handleDelete() {
    if (!project) return;
    removeProject(project.id);
    haptic.warn();
    showSuccess("Proyecto eliminado");
    onClose();
  }

  return (
    <Sheet
      title={project ? "Editar proyecto" : "Nuevo proyecto"}
      onClose={safeClose}
      footer={
        <SheetActions
          canSave={canSave}
          submitting={submitting}
          onSave={handleSave}
          onDelete={project ? handleDelete : undefined}
          confirmText="¿Eliminar este proyecto?"
        />
      }
    >
      {economics && (
        <div className="money-panel money-panel--compact">
          <div className="money-stats" style={{ marginBottom: 0 }}>
            <div>
              <div className="money-stat-label">Vendido</div>
              <div className="money-stat-value">{formatMXNShort(economics.revenue)}</div>
            </div>
            <div>
              <div className="money-stat-label">Invertido</div>
              <div className="money-stat-value">{formatMXNShort(economics.spent)}</div>
            </div>
            <div>
              <div className="money-stat-label">Margen</div>
              <div
                className={`money-stat-value ${
                  economics.margin < 0
                    ? "money-margin-neg"
                    : economics.margin > 0
                      ? "money-margin-pos"
                      : ""
                }`}
              >
                {formatMXNShortSigned(economics.margin)}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="input-group">
        <label className="input-label" htmlFor="project-title">Título</label>
        <input
          id="project-title"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Retrato, serie, encargo..."
          autoFocus={project === null}
        />
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="project-medium">Técnica / medio</label>
        <input id="project-medium" className="input" value={medium} onChange={(e) => setMedium(e.target.value)} placeholder="Óleo, acrílico, grabado..." />
      </div>

      <div className="input-group">
        <span className="input-label">Estado</span>
        <SegmentedControl
          items={STATUS_ITEMS}
          value={status}
          onChange={(k) => setStatus(k as ProjectStatus)}
          size="sm"
          role="radiogroup"
          ariaLabel="Estado"
        />
      </div>

      <div className="form-row">
        <div className="input-group">
          <label className="input-label" htmlFor="project-start">Inicio</label>
          <input id="project-start" className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="project-due">Entrega</label>
          <input id="project-due" className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="project-price">Precio (MXN)</label>
        <div className="money-input-wrap">
          <span className="money-input-symbol">$</span>
          <input id="project-price" className="input money-input" type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
        </div>
      </div>

      <div className="input-group">
        <span className="input-label">Cliente / galería</span>
        <PickerField
          title="Cliente / galería"
          options={contactOptions}
          value={contactId}
          onChange={setContactId}
        />
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="project-notes">Notas</label>
        <textarea id="project-notes" className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Sheet>
  );
}
