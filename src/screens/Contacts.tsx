import { useState } from "react";
import { useApp } from "../context/AppContext";
import type { Contact, ContactRelationship } from "../types";
import { CONTACT_RELATIONSHIP, LEAD_STAGE, labelFor } from "../data/constants";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { ContactSheet } from "../components/ContactSheet";

const RELATIONSHIP_BADGE: Record<ContactRelationship, string> = {
  lead: "badge-amber",
  client: "badge-clay",
  gallery: "badge-plum",
  supplier: "badge-neutral",
  collaborator: "badge-sage",
  other: "badge-neutral"
};

export function Contacts() {
  const { contacts } = useApp();
  const [editing, setEditing] = useState<Contact | null | "new">(null);

  const sorted = [...contacts].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="page">
      <div className="topbar-title" style={{ marginBottom: 16 }}>
        Contactos
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon="users"
          title="Sin contactos todavía"
          body="Agrega clientes, galerías, prospectos o colaboradores."
        />
      ) : (
        <div className="card">
          {sorted.map((contact) => (
            <button
              key={contact.id}
              className="row-item"
              style={{ width: "100%", textAlign: "left" }}
              onClick={() => setEditing(contact)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{contact.name}</div>
                <div style={{ fontSize: "var(--text-sm)", color: "var(--charcoal-md)" }}>
                  {contact.relationship === "lead" && contact.leadStage
                    ? labelFor(LEAD_STAGE, contact.leadStage)
                    : contact.email || contact.phone || " "}
                </div>
              </div>
              <span className={`badge ${RELATIONSHIP_BADGE[contact.relationship]}`}>
                {labelFor(CONTACT_RELATIONSHIP, contact.relationship)}
              </span>
            </button>
          ))}
        </div>
      )}

      <button className="fab" onClick={() => setEditing("new")} aria-label="Nuevo contacto">
        <Icon name="plus" size={24} />
      </button>

      {editing && <ContactSheet contact={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
