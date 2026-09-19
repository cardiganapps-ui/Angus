import { useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { Contact, ContactRelationship, LeadStage } from "../types";
import { CONTACT_RELATIONSHIP, LEAD_STAGE } from "../data/constants";
import { Sheet } from "./Sheet";
import { SheetActions } from "./SheetActions";
import { ChipSelect } from "./ChipSelect";
import { makeId } from "../utils/id";
import { useDirtyGuard } from "../hooks/useDirtyGuard";
import { todayISO } from "../utils/dates";
import { haptic } from "../lib/haptics";
import { prefersAutoFocus } from "../lib/device";

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

  const dirty = useDirtyGuard({ name, relationship, email, phone, leadStage, followUpDate, notes });

  const safeClose = submitting ? null : onClose;
  const canSave = name.trim().length > 0;
  const isLead = relationship === "lead";

  async function handleSave() {
    if (!canSave || submitting) return;
    setSubmitting(true);
    const patch = {
      name: name.trim(),
      relationship,
      email: email.trim(),
      phone: phone.trim(),
      // A client who came in as a lead keeps "won" so Reportes can count the conversion.
      leadStage: isLead ? leadStage : contact?.leadStage === "won" ? "won" : null,
      followUpDate: isLead && followUpDate ? followUpDate : null,
      notes: notes.trim()
    };
    const id = contact ? contact.id : makeId();
    const ok = contact
      ? await updateContact(contact.id, patch)
      : await addContact({ id, createdAt: todayISO(), ...patch });
    if (!ok) {
      // The store reverted and reported why; keep her input on screen.
      setSubmitting(false);
      return;
    }
    haptic.success();
    showSuccess(contact ? "Contacto actualizado" : "Contacto creado");
    if (!contact && onCreated) onCreated(id);
    else onClose();
  }

  async function handleDelete() {
    if (!contact || submitting) return;
    setSubmitting(true);
    if (!(await removeContact(contact.id))) {
      // The store reverted and reported why; nothing was removed.
      setSubmitting(false);
      return;
    }
    haptic.warn();
    showSuccess("Contacto eliminado");
    (onDeleted ?? onClose)();
  }

  return (
    <Sheet
      title={contact ? "Editar contacto" : "Nuevo contacto"}
      onClose={safeClose}
      dirty={dirty}
      discardText={
        contact
          ? "¿Descartar los cambios? El contacto se queda como estaba."
          : "¿Descartar? Este contacto no se guarda."
      }
      footer={
        <SheetActions
          canSave={canSave}
          submitting={submitting}
          onSave={() => void handleSave()}
          onDelete={contact ? () => void handleDelete() : undefined}
          confirmText="¿Eliminar este contacto? Sus ingresos y eventos quedan sin contacto ligado, sus cobros fijos se detienen y su asistencia a clases se borra."
        />
      }
    >
      <div className="input-group">
        <label className="input-label" htmlFor="contact-name">Nombre</label>
        <input id="contact-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus={contact === null && prefersAutoFocus()} />
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
