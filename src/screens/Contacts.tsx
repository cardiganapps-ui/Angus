import { useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import type { Contact, ContactRelationship } from "../types";
import { CONTACT_RELATIONSHIP, LEAD_STAGE, labelFor } from "../data/constants";
import { contactOwed } from "../utils/accounting";
import { formatMXN } from "../utils/money";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { ContactSheet } from "../components/ContactSheet";

/* Semantic badges — none of them the primary accent: amber = prospect
   (a pending relationship, which is what amber means everywhere else in
   this palette), teal = active client, purple = gallery, green =
   collaborator, gray = neutral.

   `lead` was badge-rose. With rose as the app's accent that pill sat in
   the same family as the accent chips AND as blush badge-gray two rows
   below it — on screen "Prospecto" and "Proveedor" read as the same
   pink label — and its text measured 2.3:1, the weakest in the app.
   Amber is the only free color in this map that says "pending". */
const RELATIONSHIP_BADGE: Record<ContactRelationship, string> = {
  lead: "badge-amber",
  client: "badge-teal",
  gallery: "badge-purple",
  supplier: "badge-gray",
  collaborator: "badge-green",
  other: "badge-gray"
};

export function Contacts() {
  const { contacts, sales, payments } = useApp();
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
            {sorted.map((contact, i) => {
              const owed = contactOwed(contact.id, sales, payments);
              const detail =
                contact.relationship === "lead" && contact.leadStage
                  ? labelFor(LEAD_STAGE, contact.leadStage)
                  : contact.email || contact.phone || "";
              const badge = (
                <span className={`badge ${RELATIONSHIP_BADGE[contact.relationship]}`}>
                  {labelFor(CONTACT_RELATIONSHIP, contact.relationship)}
                </span>
              );
              return (
                <button
                  key={contact.id}
                  type="button"
                  className="row-item list-entry-stagger"
                  style={{ "--stagger-i": Math.min(i, 12) } as CSSProperties}
                  onClick={() => setEditing(contact)}
                >
                  <div className="row-content">
                    <div className="row-title">{contact.name}</div>
                    {/* When there's money on the line the amount takes the
                        right-hand slot, so the badge drops to the sub-line
                        instead of crowding it at 360px. */}
                    {owed > 0 ? (
                      <div className="row-sub row-sub-inline">
                        {badge}
                        {detail && <span className="row-sub-detail">{detail}</span>}
                      </div>
                    ) : (
                      <div className="row-sub">{detail || "—"}</div>
                    )}
                  </div>
                  {owed > 0 ? (
                    <div className="money-row-right">
                      <span className="row-amount amount-owe">{formatMXN(owed)}</span>
                      <span className="money-submeta">Te debe</span>
                    </div>
                  ) : (
                    badge
                  )}
                </button>
              );
            })}
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
