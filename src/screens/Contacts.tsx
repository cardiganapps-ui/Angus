import { useMemo, useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import type { Contact, ContactRelationship, LeadStage } from "../types";
import {
  CONTACT_RELATIONSHIP,
  CONTACT_RELATIONSHIP_BADGE,
  LEAD_STAGE,
  LEAD_STAGE_BADGE,
  labelFor
} from "../data/constants";
import { contactOwed } from "../utils/accounting";
import { formatMXN } from "../utils/money";
import { formatShort, todayISO } from "../utils/dates";
import { matches } from "../utils/text";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { ContactSheet } from "../components/ContactSheet";
import { ContactDetailSheet } from "../components/ContactDetailSheet";
import { SearchField } from "../components/SearchField";
import { SegmentedControl } from "../components/SegmentedControl";
import { haptic } from "../lib/haptics";

type View = "all" | "pipeline";
type Filter = "all" | ContactRelationship;
const VIEW_ITEMS = [
  { k: "all", l: "Todos" },
  { k: "pipeline", l: "Prospectos" }
];
const STAGE_ORDER: LeadStage[] = ["new", "contacted", "negotiating", "won", "lost"];

const stagger = (i: number) => ({ "--stagger-i": Math.min(i, 12) }) as CSSProperties;

/* ── Contactos ──
   Everyone she works with, searchable and filterable, plus a pipeline
   view that groups leads by stage with their next follow-up. Tapping a
   row opens the detail sheet (reach out, balance, sales, agenda). */
export function Contacts() {
  const { contacts, sales, payments } = useApp();
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const today = todayISO();

  const filtered = useMemo(() => {
    let list = contacts;
    if (query.trim()) list = list.filter((c) => matches(`${c.name} ${c.email} ${c.phone}`, query));
    if (filter !== "all") list = list.filter((c) => c.relationship === filter);
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts, query, filter]);

  const leads = useMemo(() => contacts.filter((c) => c.relationship === "lead"), [contacts]);
  const stages = useMemo(
    () =>
      STAGE_ORDER.map((stage) => ({
        stage,
        items: leads
          .filter((c) => (c.leadStage ?? "new") === stage)
          .sort(
            (a, b) =>
              (a.followUpDate ?? "9999").localeCompare(b.followUpDate ?? "9999") || a.name.localeCompare(b.name)
          )
      })).filter((s) => s.items.length > 0),
    [leads]
  );
  const dueFollowUps = leads.filter((c) => c.followUpDate && c.followUpDate <= today).length;

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">
          {contacts.length} {contacts.length === 1 ? "contacto" : "contactos"}
          {dueFollowUps > 0
            ? ` · ${dueFollowUps} ${dueFollowUps === 1 ? "seguimiento" : "seguimientos"} para hoy`
            : ""}
        </div>
        <h1 className="page-title">Contactos</h1>
      </div>

      {contacts.length > 0 && (
        <div className="money-switch">
          <SegmentedControl
            items={VIEW_ITEMS}
            value={view}
            onChange={(k) => setView(k as View)}
            size="md"
            ariaLabel="Vista de contactos"
          />
        </div>
      )}

      {contacts.length === 0 ? (
        <div className="section">
          <div className="card">
            <EmptyState
              icon="users"
              title="Sin contactos todavía"
              body="Agrega clientes, galerías, prospectos o colaboradores. Desde su ficha puedes escribirles por WhatsApp."
              actionLabel="Agregar contacto"
              onAction={() => setCreating(true)}
            />
          </div>
        </div>
      ) : view === "pipeline" ? (
        stages.length === 0 ? (
          <div className="section">
            <div className="card">
              <EmptyState
                icon="users"
                title="Sin prospectos"
                body="Marca un contacto como prospecto para darle seguimiento por etapa."
              />
            </div>
          </div>
        ) : (
          stages.map((s) => (
            <div className="section" key={s.stage}>
              <div className="section-header">
                <span className="section-title">
                  <span className={`badge ${LEAD_STAGE_BADGE[s.stage]}`}>{labelFor(LEAD_STAGE, s.stage)}</span>
                </span>
                <span className="pipeline-stage-count">{s.items.length}</span>
              </div>
              <div className="card">
                {s.items.map((c, i) => (
                  <Row
                    key={c.id}
                    contact={c}
                    i={i}
                    owed={0}
                    detail={followUpLabel(c, today)}
                    overdue={!!c.followUpDate && c.followUpDate < today}
                    onClick={() => setDetailId(c.id)}
                  />
                ))}
              </div>
            </div>
          ))
        )
      ) : (
        <>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Buscar por nombre, correo, teléfono…"
            ariaLabel="Buscar contactos"
          />
          <div className="filter-row" role="group" aria-label="Filtrar por tipo">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
              Todos
            </FilterChip>
            {CONTACT_RELATIONSHIP.map((r) => (
              <FilterChip key={r.value} active={filter === r.value} onClick={() => setFilter(r.value)}>
                {r.label}
              </FilterChip>
            ))}
          </div>
          <div className="section">
            {filtered.length === 0 ? (
              <div className="card">
                <EmptyState icon="search" title="Nadie coincide" body="Prueba con otro nombre o quita el filtro." />
              </div>
            ) : (
              <div className="card">
                {filtered.map((contact, i) => {
                  const owed = contactOwed(contact.id, sales, payments);
                  const detail =
                    contact.relationship === "lead" && contact.leadStage
                      ? labelFor(LEAD_STAGE, contact.leadStage)
                      : contact.email || contact.phone || "";
                  return (
                    <Row
                      key={contact.id}
                      contact={contact}
                      i={i}
                      owed={owed}
                      detail={detail}
                      onClick={() => setDetailId(contact.id)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      <button className="fab" onClick={() => setCreating(true)} aria-label="Nuevo contacto">
        <Icon name="plus" size={24} strokeWidth={2.2} />
      </button>

      {creating && <ContactSheet contact={null} onClose={() => setCreating(false)} />}
      {detailId && <ContactDetailSheet contactId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function followUpLabel(c: Contact, today: string): string {
  if (!c.followUpDate) return "Sin seguimiento programado";
  if (c.followUpDate < today) return `Seguimiento vencido · ${formatShort(c.followUpDate)}`;
  if (c.followUpDate === today) return "Seguimiento hoy";
  return `Seguimiento ${formatShort(c.followUpDate)}`;
}

function FilterChip({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`chip ${active ? "active" : ""}`}
      aria-pressed={active}
      onClick={() => {
        haptic.tap();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function Row({
  contact,
  i,
  owed,
  detail,
  overdue,
  onClick
}: {
  contact: Contact;
  i: number;
  owed: number;
  detail: string;
  overdue?: boolean;
  onClick: () => void;
}) {
  const badge = (
    <span className={`badge ${CONTACT_RELATIONSHIP_BADGE[contact.relationship]}`}>
      {labelFor(CONTACT_RELATIONSHIP, contact.relationship)}
    </span>
  );
  return (
    <button type="button" className="row-item list-entry-stagger" style={stagger(i)} onClick={onClick}>
      <div className="row-content">
        <div className="row-title">{contact.name}</div>
        {owed > 0 ? (
          <div className="row-sub row-sub-inline">
            {badge}
            {detail && <span className="row-sub-detail">{detail}</span>}
          </div>
        ) : (
          <div className="row-sub" style={overdue ? { color: "var(--red)" } : undefined}>
            {detail || "—"}
          </div>
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
      <span className="row-chevron" aria-hidden="true">
        <Icon name="chevron-right" size={16} />
      </span>
    </button>
  );
}
