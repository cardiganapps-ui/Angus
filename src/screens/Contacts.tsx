import { useState } from "react";
import { useApp } from "../context/AppContext";
import type { Contact, ContactRelationship } from "../types";
import { CONTACT_RELATIONSHIP, LEAD_STAGE, labelFor } from "../data/constants";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { ContactSheet } from "../components/ContactSheet";

/* Cardigan semantic badges: rose = lead / potential lane, teal = active
   client, purple = gallery, green = collaborator, gray = neutral. */
const RELATIONSHIP_BADGE: Record<ContactRelationship, string> = {
  lead: "badge-rose",
  client: "badge-teal",
  gallery: "badge-purple",
  supplier: "badge-gray",
  collaborator: "badge-green",
  other: "badge-gray"
};

export function Contacts() {
  const { contacts } = useApp();
  const [editing, setEditing] = useState<Contact | null | "new">(null);

  const sorted = [...contacts].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">{sorted.length} {sorted.length === 1 ? "contacto" : "contactos"}</div>
        <h1 className="page-title">Contactos</h1>
      </div>

      <div className="section">
        {sorted.length === 0 ? (
          <div className="card">
            <EmptyState
              icon="users"
              title="Sin contactos todavía"
              body="Agrega clientes, galerías, prospectos o colaboradores."
            />
          </div>
        ) : (
          <div className="card">
            {sorted.map((contact) => (
              <button
                key={contact.id}
                type="button"
                className="row-item"
                onClick={() => setEditing(contact)}
              >
                <div className="row-content">
                  <div className="row-title">{contact.name}</div>
                  <div className="row-sub">
                    {contact.relationship === "lead" && contact.leadStage
                      ? labelFor(LEAD_STAGE, contact.leadStage)
                      : contact.email || contact.phone || "—"}
                  </div>
                </div>
                <span className={`badge ${RELATIONSHIP_BADGE[contact.relationship]}`}>
                  {labelFor(CONTACT_RELATIONSHIP, contact.relationship)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button className="fab" onClick={() => setEditing("new")} aria-label="Nuevo contacto">
        <Icon name="plus" size={24} strokeWidth={2.2} />
      </button>

      {editing && <ContactSheet contact={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
