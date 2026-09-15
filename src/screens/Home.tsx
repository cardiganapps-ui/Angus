import { useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import { EVENT_KIND, EVENT_KIND_BADGE, labelFor } from "../data/constants";
import { overdueInstallments } from "../utils/accounting";
import { formatMXN } from "../utils/money";
import { daysUntil, formatWithWeekday, todayISO } from "../utils/dates";
import { EmptyState } from "../components/EmptyState";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { SaleDetailSheet } from "../components/SaleDetailSheet";

const stagger = (i: number) => ({ "--stagger-i": Math.min(i, 12) } as CSSProperties);

export function Home() {
  const { events, projects, contacts, sales, installments, payments } = useApp();
  const today = todayISO();
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null);

  const upcoming = events
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""))
    .slice(0, 5);

  const activeProjects = projects.filter((p) => p.status === "in_progress").length;
  const dueFollowUps = contacts.filter(
    (c) => c.followUpDate && c.followUpDate <= today
  ).length;

  const overdue = overdueInstallments(sales, installments, payments, today);

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">{formatWithWeekday(today)}</div>
        <h1 className="page-title">Tu día</h1>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card list-entry-stagger" style={stagger(0)}>
          <div className="kpi-label">Proyectos activos</div>
          <div className="kpi-value"><AnimatedNumber value={activeProjects} /></div>
        </div>
        <div className="kpi-card list-entry-stagger" style={stagger(1)}>
          <div className="kpi-label">Seguimientos</div>
          <div className="kpi-value"><AnimatedNumber value={dueFollowUps} /></div>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-title">Próximos eventos</span>
        </div>
        {upcoming.length === 0 ? (
          <div className="card">
            <EmptyState
              icon="calendar"
              title="Nada agendado"
              body="Cuando agregues clases, expos o entregas, aparecerán aquí."
            />
          </div>
        ) : (
          <div className="card">
            {upcoming.map((event, i) => {
              const kind = EVENT_KIND.find((k) => k.value === event.kind)!;
              return (
                <div className="row-item list-entry-stagger" key={event.id} style={stagger(i)}>
                  <span className="event-dot" style={{ background: kind.color }} />
                  <div className="row-content">
                    <div className="row-title">{event.title}</div>
                    <div className="row-sub">
                      {formatWithWeekday(event.date)}
                      {event.startTime ? ` · ${event.startTime}` : ""}
                    </div>
                  </div>
                  <span className={`badge ${EVENT_KIND_BADGE[event.kind]}`}>{labelFor(EVENT_KIND, event.kind)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {overdue.length > 0 && (
        <div className="section">
          <div className="section-header">
            <span className="section-title">Cuotas vencidas</span>
            <span className="badge badge-red">{overdue.length}</span>
          </div>
          <div className="card">
            {overdue.map(({ installment, remaining }, i) => {
              const sale = sales.find((s) => s.id === installment.saleId);
              const contact = contacts.find((c) => c.id === sale?.contactId);
              const late = -daysUntil(installment.dueDate);
              return (
                <button
                  key={installment.id}
                  type="button"
                  className="row-item list-entry-stagger"
                  style={stagger(i)}
                  onClick={() => setDetailSaleId(installment.saleId)}
                >
                  <div className="row-content">
                    <div className="row-title">{contact?.name ?? sale?.title ?? "Venta"}</div>
                    <div className="row-sub">
                      Venció hace {late} {late === 1 ? "día" : "días"}
                      {sale ? ` · ${sale.title}` : ""}
                    </div>
                  </div>
                  <span className="row-amount amount-owe">{formatMXN(remaining)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {detailSaleId && (
        <SaleDetailSheet saleId={detailSaleId} onClose={() => setDetailSaleId(null)} />
      )}
    </div>
  );
}
