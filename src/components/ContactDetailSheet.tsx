import { useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { Contact, LeadStage } from "../types";
import {
  CONTACT_RELATIONSHIP,
  CONTACT_RELATIONSHIP_BADGE,
  COURSE_KIND,
  COURSE_STATUS,
  COURSE_STATUS_BADGE,
  EVENT_KIND,
  EVENT_KIND_BADGE,
  LEAD_STAGE,
  LEAD_STAGE_BADGE,
  SALE_STATUS,
  SALE_STATUS_BADGE,
  labelFor
} from "../data/constants";
import { saleBalance, saleCountsTowardRevenue, totals } from "../utils/accounting";
import { formatMXN, formatMXNShort } from "../utils/money";
import { addDays, formatShort, formatWithWeekday, todayISO } from "../utils/dates";
import { attendanceRate, groupSessions } from "../utils/classes";
import { Sheet } from "./Sheet";
import { Icon } from "./Icon";
import { SegmentedControl } from "./SegmentedControl";
import { ContactSheet } from "./ContactSheet";
import { SaleDetailSheet } from "./SaleDetailSheet";
import { EventSheet } from "./EventSheet";
import { haptic } from "../lib/haptics";

/* ── ContactDetailSheet ──
   Everything about one person: reach them (WhatsApp / llamar / correo),
   what they owe, their sales, upcoming sessions, and — for a lead —
   one-tap follow-up actions. Editing still goes through ContactSheet. */

type Tab = "info" | "sales" | "agenda" | "classes" | "studies";
const TAB_ITEMS = [
  { k: "info", l: "Info" },
  { k: "sales", l: "Ventas" },
  { k: "agenda", l: "Agenda" },
  { k: "classes", l: "Clases" },
  { k: "studies", l: "Estudios" }
];

function waLink(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return null;
  // Mexican numbers without a country code get 52 (WhatsApp needs it).
  const full = digits.length === 10 ? `52${digits}` : digits;
  return `https://wa.me/${full}`;
}

export function ContactDetailSheet({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const { contacts, sales, payments, events, updateContact, groups, enrollments, attendance, courses } = useApp();
  const { showSuccess } = useToast();
  const [tab, setTab] = useState<Tab>("info");
  const [editing, setEditing] = useState(false);
  const [saleId, setSaleId] = useState<string | null>(null);
  const [eventEditing, setEventEditing] = useState<string | null>(null);
  const closeRef = useRef<(() => void) | null>(null);

  const live = contacts.find((c) => c.id === contactId) ?? null;
  const last = useRef<Contact | null>(live);
  if (live) last.current = live;
  const contact = live ?? last.current;

  const clientSales = useMemo(
    () =>
      sales
        .filter((s) => s.contactId === contactId)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [sales, contactId]
  );
  const counting = clientSales.filter(saleCountsTowardRevenue);
  const t = totals(counting, payments);
  const today = todayISO();
  const agenda = useMemo(
    () =>
      events
        .filter((e) => e.contactId === contactId && !e.cancelled)
        .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? "")),
    [events, contactId]
  );
  const upcoming = agenda.filter((e) => e.date >= today);
  const past = agenda.filter((e) => e.date < today).reverse().slice(0, 6);
  const myGroups = useMemo(
    () =>
      enrollments
        .filter((e) => e.contactId === contactId)
        .map((e) => ({ enrollment: e, group: groups.find((g) => g.id === e.groupId) }))
        .filter((x): x is { enrollment: (typeof enrollments)[number]; group: NonNullable<typeof x.group> } => !!x.group),
    [enrollments, groups, contactId]
  );
  // Courses this person teaches her (or that this school hosts).
  const taught = useMemo(() => courses.filter((c) => c.teacherContactId === contactId), [courses, contactId]);
  const tabItems = TAB_ITEMS.filter((t) => (t.k === "classes" ? myGroups.length > 0 : t.k === "studies" ? taught.length > 0 : true));

  if (!contact) return null;

  const wa = contact.phone ? waLink(contact.phone) : null;
  const isLead = contact.relationship === "lead";

  function setStage(stage: LeadStage) {
    haptic.tap();
    void updateContact(contactId, {
      leadStage: stage,
      ...(stage === "won" ? { relationship: "client" as const, followUpDate: null } : {}),
      ...(stage === "lost" ? { followUpDate: null } : {})
    });
    showSuccess(stage === "won" ? "Ahora es cliente" : `Etapa: ${labelFor(LEAD_STAGE, stage)}`);
  }
  function setFollowUp(days: number) {
    haptic.tap();
    void updateContact(contactId, { followUpDate: addDays(today, days) });
    showSuccess(days === 0 ? "Seguimiento para hoy" : `Seguimiento en ${days} días`);
  }

  return (
    <>
      <Sheet
        title={contact.name}
        onClose={onClose}
        closeRef={closeRef}
        footer={
          <div className="sheet-actions">
            <div className="sheet-actions-state">
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
                Editar contacto
              </button>
            </div>
          </div>
        }
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <span className={`badge ${CONTACT_RELATIONSHIP_BADGE[contact.relationship]}`}>
            {labelFor(CONTACT_RELATIONSHIP, contact.relationship)}
          </span>
          {isLead && contact.leadStage && (
            <span className={`badge ${LEAD_STAGE_BADGE[contact.leadStage]}`}>{labelFor(LEAD_STAGE, contact.leadStage)}</span>
          )}
          {contact.followUpDate && (
            <span className="money-submeta">
              Seguimiento {contact.followUpDate < today ? "vencido · " : ""}
              {formatShort(contact.followUpDate)}
            </span>
          )}
        </div>

        <div className="contact-actions">
          <a className="contact-action btn-tap" href={wa ?? undefined} target="_blank" rel="noopener" aria-disabled={!wa} onClick={() => haptic.tap()}>
            <Icon name="message" size={20} />
            WhatsApp
          </a>
          <a className="contact-action btn-tap" href={contact.phone ? `tel:${contact.phone}` : undefined} aria-disabled={!contact.phone} onClick={() => haptic.tap()}>
            <Icon name="phone" size={20} />
            Llamar
          </a>
          <a className="contact-action btn-tap" href={contact.email ? `mailto:${contact.email}` : undefined} aria-disabled={!contact.email} onClick={() => haptic.tap()}>
            <Icon name="mail" size={20} />
            Correo
          </a>
        </div>

        {t.owed > 0 && (
          <div className="money-panel money-panel--compact" style={{ marginBottom: 14 }}>
            <div className="money-stats" style={{ marginBottom: 0 }}>
              <div>
                <div className="money-stat-label">Vendido</div>
                <div className="money-stat-value">{formatMXNShort(t.committed)}</div>
              </div>
              <div>
                <div className="money-stat-label">Pagado</div>
                <div className="money-stat-value money-stat-value--paid">{formatMXNShort(t.paid)}</div>
              </div>
              <div>
                <div className="money-stat-label">Te debe</div>
                <div className="money-stat-value money-stat-value--owed">{formatMXNShort(t.owed)}</div>
              </div>
            </div>
          </div>
        )}

        <SegmentedControl items={tabItems} value={tab} onChange={(k) => setTab(k as Tab)} size="sm" ariaLabel="Sección" />

        {tab === "info" && (
          <div style={{ marginTop: 14 }}>
            <div className="money-list">
              <div className="row-item" style={{ cursor: "default" }}>
                <div className="row-content">
                  <div className="row-sub">Teléfono</div>
                  <div className="row-title">{contact.phone || "—"}</div>
                </div>
              </div>
              <div className="row-item" style={{ cursor: "default" }}>
                <div className="row-content">
                  <div className="row-sub">Correo</div>
                  <div className="row-title">{contact.email || "—"}</div>
                </div>
              </div>
              {contact.notes && (
                <div className="row-item" style={{ cursor: "default" }}>
                  <div className="row-content">
                    <div className="row-sub">Notas</div>
                    <div className="row-title" style={{ whiteSpace: "pre-wrap", fontWeight: 500 }}>{contact.notes}</div>
                  </div>
                </div>
              )}
            </div>

            {isLead && contact.leadStage !== "won" && contact.leadStage !== "lost" && (
              <>
                <div className="money-sheet-section">
                  <span className="money-sheet-section-title">Seguimiento</span>
                </div>
                <div className="money-list">
                  <div className="quick-actions" style={{ borderTop: "none" }}>
                    <button type="button" className="btn btn-secondary btn-mini" onClick={() => setFollowUp(0)}>Hoy</button>
                    <button type="button" className="btn btn-secondary btn-mini" onClick={() => setFollowUp(3)}>+3 días</button>
                    <button type="button" className="btn btn-secondary btn-mini" onClick={() => setFollowUp(7)}>+1 semana</button>
                  </div>
                  <div className="quick-actions">
                    {contact.leadStage !== "contacted" && (
                      <button type="button" className="btn btn-ghost btn-mini" onClick={() => setStage("contacted")}>Contactado</button>
                    )}
                    {contact.leadStage !== "negotiating" && (
                      <button type="button" className="btn btn-ghost btn-mini" onClick={() => setStage("negotiating")}>Negociando</button>
                    )}
                    <button type="button" className="btn btn-teal-soft btn-mini" onClick={() => setStage("won")}>Ganado</button>
                    <button type="button" className="btn btn-ghost btn-mini" style={{ color: "var(--red)" }} onClick={() => setStage("lost")}>Perdido</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "sales" && (
          <div className="money-list" style={{ marginTop: 14 }}>
            {clientSales.length === 0 ? (
              <div className="money-list-empty">Sin ventas con este contacto todavía.</div>
            ) : (
              clientSales.map((sale) => {
                const b = saleBalance(sale, payments);
                const owes = saleCountsTowardRevenue(sale) && b.owed > 0;
                return (
                  <button key={sale.id} type="button" className="row-item" onClick={() => setSaleId(sale.id)}>
                    <div className="row-content">
                      <div className="row-title">{sale.title}</div>
                      <div className="row-sub">{formatShort(sale.date)}</div>
                    </div>
                    <div className="money-row-right">
                      <span className={`badge ${SALE_STATUS_BADGE[sale.status]}`}>{labelFor(SALE_STATUS, sale.status)}</span>
                      <span className={`row-amount ${owes ? "amount-owe" : ""}`}>{owes ? formatMXN(b.owed) : formatMXN(sale.amount)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {tab === "classes" && (
          <div className="money-list" style={{ marginTop: 14 }}>
            {myGroups.map(({ enrollment, group }) => {
              const sessions = groupSessions(group, events).filter((s) => s.date <= today);
              const rate = attendanceRate(contactId, sessions, attendance);
              const activeNow = enrollment.endedOn === null || enrollment.endedOn >= today;
              return (
                <div className="row-item" key={enrollment.id} style={{ cursor: "default" }}>
                  <div className="row-content">
                    <div className="row-title">{group.name}</div>
                    <div className="row-sub">
                      {activeNow ? `Desde ${formatShort(enrollment.startedOn)}` : `Hasta ${formatShort(enrollment.endedOn ?? enrollment.startedOn)}`}
                      {rate.rate !== null ? ` · asiste ${rate.rate}% (${rate.present} de ${rate.present + rate.absent})` : " · sin asistencias aún"}
                    </div>
                  </div>
                  <span className={`badge ${activeNow ? "badge-blue" : "badge-gray"}`}>{activeNow ? "Inscrito" : "Baja"}</span>
                </div>
              );
            })}
          </div>
        )}

        {tab === "studies" && (
          <div className="money-list" style={{ marginTop: 14 }}>
            {taught.map((c) => (
              <div className="row-item" key={c.id} style={{ cursor: "default" }}>
                <div className="row-content">
                  <div className="row-title">{c.name}</div>
                  <div className="row-sub">
                    {labelFor(COURSE_KIND, c.kind)}
                    {c.institution ? ` · ${c.institution}` : ""}
                    {c.startDate ? ` · desde ${formatShort(c.startDate)}` : ""}
                  </div>
                </div>
                <span className={`badge ${COURSE_STATUS_BADGE[c.status]}`}>{labelFor(COURSE_STATUS, c.status)}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "agenda" && (
          <div className="money-list" style={{ marginTop: 14 }}>
            {agenda.length === 0 ? (
              <div className="money-list-empty">Nada agendado con este contacto.</div>
            ) : (
              [...upcoming, ...past].map((e) => (
                <button key={e.id} type="button" className={`row-item ${e.date < today ? "row-item--muted" : ""}`} onClick={() => setEventEditing(e.id)}>
                  <span className="event-dot" style={{ background: EVENT_KIND.find((k) => k.value === e.kind)?.color }} />
                  <div className="row-content">
                    <div className="row-title">{e.title}</div>
                    <div className="row-sub">
                      {formatWithWeekday(e.date)}
                      {e.startTime ? ` · ${e.startTime}` : ""}
                    </div>
                  </div>
                  <span className={`badge ${EVENT_KIND_BADGE[e.kind]}`}>{labelFor(EVENT_KIND, e.kind)}</span>
                </button>
              ))
            )}
          </div>
        )}
      </Sheet>

      {editing && (
        <ContactSheet
          contact={contact}
          onClose={() => setEditing(false)}
          onDeleted={() => {
            setEditing(false);
            (closeRef.current ?? onClose)();
          }}
        />
      )}
      {saleId && <SaleDetailSheet saleId={saleId} onClose={() => setSaleId(null)} />}
      {eventEditing && (
        <EventSheet event={events.find((e) => e.id === eventEditing) ?? null} onClose={() => setEventEditing(null)} />
      )}
    </>
  );
}
