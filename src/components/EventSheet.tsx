import { useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { EventKind, ScheduleEvent } from "../types";
import { EVENT_KIND } from "../data/constants";
import { Sheet } from "./Sheet";
import { SheetActions } from "./SheetActions";
import { ChipSelect } from "./ChipSelect";
import { PickerField } from "./PickerField";
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

  const safeClose = submitting ? null : onClose;
  const canSave = title.trim().length > 0 && date.length > 0;
  const projectOptions = [...projects]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((p) => ({ value: p.id, label: p.title }));
  const contactOptions = [...contacts]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: c.name }));

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
        <SheetActions
          canSave={canSave}
          submitting={submitting}
          onSave={handleSave}
          onDelete={event ? handleDelete : undefined}
          confirmText="¿Eliminar este evento?"
        />
      }
    >
      <div className="input-group">
        <label className="input-label" htmlFor="event-title">Título</label>
        <input id="event-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={event === null} />
      </div>

      <div className="input-group">
        <span className="input-label">Tipo</span>
        <ChipSelect options={EVENT_KIND} value={kind} onChange={setKind} ariaLabel="Tipo de evento" />
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="event-date">Fecha</label>
        <input id="event-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="form-row">
        <div className="input-group">
          <label className="input-label" htmlFor="event-start">Hora inicio</label>
          <input id="event-start" className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="event-end">Hora fin</label>
          <input id="event-end" className="input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="event-location">Ubicación</label>
        <input id="event-location" className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>

      <div className="input-group">
        <span className="input-label">Proyecto relacionado</span>
        <PickerField title="Proyecto relacionado" options={projectOptions} value={projectId} onChange={setProjectId} />
      </div>

      <div className="input-group">
        <span className="input-label">Contacto relacionado</span>
        <PickerField title="Contacto relacionado" options={contactOptions} value={contactId} onChange={setContactId} />
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="event-notes">Notas</label>
        <textarea id="event-notes" className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Sheet>
  );
}
