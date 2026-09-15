import { useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { Contact, ContactRelationship, LeadStage } from "../types";
import { CONTACT_RELATIONSHIP, LEAD_STAGE } from "../data/constants";
import { Sheet } from "./Sheet";
import { SheetActions } from "./SheetActions";
import { ChipSelect } from "./ChipSelect";
import { makeId } from "../utils/id";
import { todayISO } from "../utils/dates";
import { haptic } from "../lib/haptics";

export function ContactSheet({
  contact,
  onClose,
  onDeleted,
  onCreated
}: {
  contact: Contact | null;
  onClose: () => void;
  /** Called instead of onClose after a delete, so a detail sheet underneath closes too. */
  onDeleted?: () => void;
  /** Called with the new id after a create (enrolling a brand-new student). */
  onCreated?: (id: string) => void;
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
      haptic.success();
      showSuccess("Contacto actualizado");
      onClose();
      return;
    }
    const id = makeId();
    void addContact({ id, createdAt: todayISO(), ...patch }).then((ok) => {
      if (ok && onCreated) onCreated(id);
    });
    haptic.success();
    showSuccess("Contacto creado");
    if (!onCreated) onClose();
  }

  function handleDelete() {
    if (!contact) return;
    removeContact(contact.id);
    haptic.warn();
    showSuccess("Contacto eliminado");
    (onDeleted ?? onClose)();
  }

  return (
    <Sheet
      title={contact ? "Editar contacto" : "Nuevo contacto"}
      onClose={safeClose}
      footer={
        <SheetActions
          canSave={canSave}
          submitting={submitting}
          onSave={handleSave}
          onDelete={contact ? handleDelete : undefined}
          confirmText="¿Eliminar este contacto? Sus ventas y eventos quedan sin contacto ligado."
        />
      }
    >
      <div className="input-group">
        <label className="input-label" htmlFor="contact-name">Nombre</label>
        <input id="contact-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus={contact === null} />
      </div>

      <div className="input-group">
        <span className="input-label">Tipo</span>
        <ChipSelect options={CONTACT_RELATIONSHIP} value={relationship} onChange={setRelationship} ariaLabel="Tipo de contacto" />
      </div>

      {isLead && (
        <>
          <div className="input-group">
            <span className="input-label">Etapa</span>
            <ChipSelect options={LEAD_STAGE} value={leadStage} onChange={setLeadStage} ariaLabel="Etapa del prospecto" />
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="contact-followup">Próximo seguimiento</label>
            <input id="contact-followup" className="input" type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </div>
        </>
      )}

      <div className="input-group">
        <label className="input-label" htmlFor="contact-email">Correo</label>
        <input id="contact-email" className="input" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="contact-phone">Teléfono</label>
        <input id="contact-phone" className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="contact-notes">Notas</label>
        <textarea id="contact-notes" className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Sheet>
  );
}
