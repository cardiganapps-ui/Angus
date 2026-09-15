import { useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { Contact, ContactRelationship, LeadStage } from "../types";
import { CONTACT_RELATIONSHIP, LEAD_STAGE } from "../data/constants";
import { Sheet } from "./Sheet";
import { makeId } from "../utils/id";
import { todayISO } from "../utils/dates";
import { haptic } from "../lib/haptics";

export function ContactSheet({
  contact,
  onClose
}: {
  contact: Contact | null;
  onClose: () => void;
}) {
  const { addContact, updateContact, removeContact } = useApp();
  const { showSuccess } = useToast();
  const [name, setName] = useState(contact?.name ?? "");
  const [relationship, setRelationship] = useState<ContactRelationship>(contact?.relationship ?? "lead");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [leadStage, setLeadStage] = useState<LeadStage>(contact?.leadStage ?? "new");
  const [followUpDate, setFollowUpDate] = useState(contact?.followUpDate ?? "");
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const safeClose = submitting ? null : onClose;
  const canSave = name.trim().length > 0;
  const isLead = relationship === "lead";

  function handleSave() {
    if (!canSave) return;
    setSubmitting(true);
    const patch = {
      name: name.trim(),
      relationship,
      email: email.trim(),
      phone: phone.trim(),
      leadStage: isLead ? leadStage : null,
      followUpDate: isLead && followUpDate ? followUpDate : null,
      notes: notes.trim()
    };
    if (contact) {
      updateContact(contact.id, patch);
    } else {
      addContact({ id: makeId(), createdAt: todayISO(), ...patch });
    }
    haptic.success();
    showSuccess(contact ? "Contacto actualizado" : "Contacto creado");
    onClose();
  }

  function handleDelete() {
    if (!contact) return;
    removeContact(contact.id);
    haptic.warn();
    showSuccess("Contacto eliminado");
    onClose();
  }

  return (
    <Sheet
      title={contact ? "Editar contacto" : "Nuevo contacto"}
      onClose={safeClose}
      footer={
        confirmDelete ? (
          <>
            <div className="input-help" style={{ textAlign: "center", marginTop: 0 }}>¿Eliminar este contacto?</div>
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
            {contact && (
              <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)} disabled={submitting}>
                Eliminar
              </button>
            )}
          </>
        )
      }
    >
      <div className="input-group">
        <label className="input-label">Nombre</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>

      <div className="input-group">
        <label className="input-label">Tipo</label>
        <select
          className="input"
          value={relationship}
          onChange={(e) => setRelationship(e.target.value as ContactRelationship)}
        >
          {CONTACT_RELATIONSHIP.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {isLead && (
        <>
          <div className="input-group">
            <label className="input-label">Etapa</label>
            <select className="input" value={leadStage} onChange={(e) => setLeadStage(e.target.value as LeadStage)}>
              {LEAD_STAGE.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">Próximo seguimiento</label>
            <input className="input" type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </div>
        </>
      )}

      <div className="input-group">
        <label className="input-label">Correo</label>
        <input className="input" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>

      <div className="input-group">
        <label className="input-label">Teléfono</label>
        <input className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>

      <div className="input-group">
        <label className="input-label">Notas</label>
        <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Sheet>
  );
}
