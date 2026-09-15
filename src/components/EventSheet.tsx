import { useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { EventKind, ScheduleEvent } from "../types";
import { EVENT_KIND } from "../data/constants";
import { Sheet } from "./Sheet";
import { makeId } from "../utils/id";
import { todayISO } from "../utils/dates";
import { haptic } from "../lib/haptics";

export function EventSheet({
  event,
  onClose
}: {
  event: ScheduleEvent | null;
  onClose: () => void;
}) {
  const { addEvent, updateEvent, removeEvent, projects, contacts } = useApp();
  const { showSuccess } = useToast();
  const [title, setTitle] = useState(event?.title ?? "");
  const [kind, setKind] = useState<EventKind>(event?.kind ?? "class");
  const [date, setDate] = useState(event?.date ?? todayISO());
  const [startTime, setStartTime] = useState(event?.startTime ?? "");
  const [endTime, setEndTime] = useState(event?.endTime ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [projectId, setProjectId] = useState(event?.projectId ?? "");
  const [contactId, setContactId] = useState(event?.contactId ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const safeClose = submitting ? null : onClose;
  const canSave = title.trim().length > 0 && date.length > 0;

  function handleSave() {
    if (!canSave) return;
    setSubmitting(true);
    const patch = {
      title: title.trim(),
      kind,
      date,
      startTime: startTime || null,
      endTime: endTime || null,
      location: location.trim(),
      projectId: projectId || null,
      contactId: contactId || null,
      notes: notes.trim()
    };
    if (event) {
      updateEvent(event.id, patch);
    } else {
      addEvent({ id: makeId(), createdAt: todayISO(), ...patch });
    }
    haptic.success();
    showSuccess(event ? "Evento actualizado" : "Evento creado");
    onClose();
  }

  function handleDelete() {
    if (!event) return;
    removeEvent(event.id);
    haptic.warn();
    showSuccess("Evento eliminado");
    onClose();
  }

  return (
    <Sheet
      title={event ? "Editar evento" : "Nuevo evento"}
      onClose={safeClose}
      footer={
        confirmDelete ? (
          <>
            <div className="input-help" style={{ textAlign: "center", marginTop: 0 }}>¿Eliminar este evento?</div>
            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={submitting}>
              Sí, eliminar
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!canSave || submitting}>
              {submitting ? "Guardando…" : "Guardar"}
            </button>
            {event && (
              <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)} disabled={submitting}>
                Eliminar
              </button>
            )}
          </>
        )
      }
    >
      <div className="input-group">
        <label className="input-label">Título</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>

      <div className="input-group">
        <label className="input-label">Tipo</label>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as EventKind)}>
          {EVENT_KIND.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      <div className="input-group">
        <label className="input-label">Fecha</label>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="form-row">
        <div className="input-group">
          <label className="input-label">Hora inicio</label>
          <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="input-group">
          <label className="input-label">Hora fin</label>
          <input className="input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
      </div>

      <div className="input-group">
        <label className="input-label">Ubicación</label>
        <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>

      <div className="input-group">
        <label className="input-label">Proyecto relacionado</label>
        <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Ninguno</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      <div className="input-group">
        <label className="input-label">Contacto relacionado</label>
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
        <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Sheet>
  );
}
