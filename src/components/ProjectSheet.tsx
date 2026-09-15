import { useState } from "react";
import { useApp } from "../context/AppContext";
import type { Project, ProjectStatus } from "../types";
import { PROJECT_STATUS } from "../data/constants";
import { Sheet } from "./Sheet";
import { makeId } from "../utils/id";
import { todayISO } from "../utils/dates";
import { Icon } from "./Icon";

export function ProjectSheet({
  project,
  onClose
}: {
  project: Project | null;
  onClose: () => void;
}) {
  const { addProject, updateProject, removeProject, contacts } = useApp();
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
    onClose();
  }

  function handleDelete() {
    if (!project) return;
    removeProject(project.id);
    onClose();
  }

  return (
    <Sheet
      title={project ? "Editar proyecto" : "Nuevo proyecto"}
      onClose={safeClose}
      footer={
        <>
          {project && (
            <button className="btn btn-ghost" onClick={handleDelete} aria-label="Eliminar">
              <Icon name="trash" size={18} />
            </button>
          )}
          <button className="btn btn-primary btn-block" onClick={handleSave} disabled={!canSave || submitting}>
            Guardar
          </button>
        </>
      }
    >
      <div className="input-group">
        <label className="input-label">Título</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Retrato, serie, encargo..." autoFocus />
      </div>

      <div className="input-group">
        <label className="input-label">Técnica / medio</label>
        <input className="input" value={medium} onChange={(e) => setMedium(e.target.value)} placeholder="Óleo, acrílico, grabado..." />
      </div>

      <div className="input-group">
        <label className="input-label">Estado</label>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
          {PROJECT_STATUS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <div className="input-group" style={{ flex: 1 }}>
          <label className="input-label">Inicio</label>
          <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="input-group" style={{ flex: 1 }}>
          <label className="input-label">Entrega</label>
          <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>

      <div className="input-group">
        <label className="input-label">Precio (MXN)</label>
        <input className="input" type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
      </div>

      <div className="input-group">
        <label className="input-label">Cliente / galería</label>
        <select className="input" value={contactId} onChange={(e) => setContactId(e.target.value)}>
          <option value="">Ninguno</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="input-group">
        <label className="input-label">Notas</label>
        <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Sheet>
  );
}
