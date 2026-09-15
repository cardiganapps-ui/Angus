import { useState } from "react";
import { useApp } from "../context/AppContext";
import type { EventKind, ScheduleEvent } from "../types";
import { EVENT_KIND } from "../data/constants";
import { Sheet } from "./Sheet";
import { makeId } from "../utils/id";
import { todayISO } from "../utils/dates";
import { Icon } from "./Icon";

export function EventSheet({
  event,
  onClose
}: {
  event: ScheduleEvent | null;
  onClose: () => void;
}) {
  const { addEvent, updateEvent, removeEvent, projects, contacts } = useApp();
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
    onClose();
  }

  function handleDelete() {
    if (!event) return;
    removeEvent(event.id);
    onClose();
  }

  return (
    <Sheet
      title={event ? "Editar evento" : "Nuevo evento"}
      onClose={safeClose}
      footer={
        <>
          {event && (
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

      <div style={{ display: "flex", gap: 10 }}>
        <div className="input-group" style={{ flex: 1 }}>
          <label className="input-label">Hora inicio</label>
          <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="input-group" style={{ flex: 1 }}>
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
        <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Sheet>
  );
}
