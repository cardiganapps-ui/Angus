import { useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import type { Contact, Project, QuickAction, ScheduleEvent } from "../types";
import type { Route } from "../hooks/useNavigation";
import { EVENT_KIND, LEAD_STAGE, labelFor } from "../data/constants";
import {
  attentionItems,
  moneyPulse,
  monthlyTrend,
  netDelta,
  practiceSnapshot,
  trendChart,
  type AttentionItem,
  type TrendChart
} from "../utils/dashboard";
import { formatMXNShort, formatMXNShortSigned } from "../utils/money";
import {
  daysUntil,
  formatDateLong,
  formatMonthLong,
  greetingFor,
  monthInitial,
  monthName,
  relativeDayLabel,
  todayISO
} from "../utils/dates";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { Icon, type IconName } from "../components/Icon";
import { ContactSheet } from "../components/ContactSheet";
import { ProjectSheet } from "../components/ProjectSheet";
import { SaleDetailSheet } from "../components/SaleDetailSheet";
import { SaleSheet } from "../components/SaleSheet";
import { ExpenseSheet } from "../components/ExpenseSheet";
import { EventSheet } from "../components/EventSheet";
import { QuickAddFab } from "../components/QuickAddFab";
import { haptic } from "../lib/haptics";

/* ── Home ──
   The dashboard. Ordered by what she can act on, not by what looks
   impressive: anything that needs her today, then this month's money,
   then the shape of the last six months, then the practice itself.
   With nothing overdue the first block collapses to a single quiet
   line, so the money becomes the top of the screen — the page is only
   as loud as the situation is.

   Every figure comes from utils/dashboard.ts. This file resolves ids to
   names, picks the Spanish and formats the pesos; it does no arithmetic
   on money. */

const TREND_MONTHS = 6;

const stagger = (i: number) => ({ "--stagger-i": Math.min(i, 12) }) as CSSProperties;

type Urgency = "overdue" | "today" | "soon";

const urgencyOf = (days: number): Urgency =>
  days < 0 ? "overdue" : days === 0 ? "today" : "soon";

const ATTENTION_ICON: Record<AttentionItem["kind"], IconName> = {
  installment: "banknote",
  followup: "users",
  deadline: "clock"
};

type OpenSheet =
  | { kind: "sale"; id: string }
  | { kind: "contact"; contact: Contact | null }
  | { kind: "project"; project: Project | null }
  | { kind: "newSale" }
  | { kind: "newExpense" }
  | { kind: "newEvent" }
  | null;

const QUICK_SHEET: Record<QuickAction, OpenSheet> = {
  sale: { kind: "newSale" },
  expense: { kind: "newExpense" },
  event: { kind: "newEvent" },
  project: { kind: "project", project: null },
  contact: { kind: "contact", contact: null }
};

export function Home({ navigate }: { navigate: (route: Route) => void }) {
  const { sales, payments, installments, expenses, contacts, projects, events } = useApp();
  const [sheet, setSheet] = useState<OpenSheet>(null);

  const today = todayISO();
  const attention = attentionItems({ sales, payments, installments, contacts, projects }, today);
  const pulse = moneyPulse(sales, payments, expenses, today);
  const delta = netDelta(pulse.netChange, today);
  const chart = trendChart(
    monthlyTrend(sales, payments, expenses, today, TREND_MONTHS),
    today.slice(0, 7)
  );
  const snapshot = practiceSnapshot(projects, events, sales, today);

  const contactName = (id?: string) => contacts.find((c) => c.id === id)?.name;

  /* An attention row says what it is, whose it is, and how late — in
     that order, because the name is what she scans for. */
  function describe(item: AttentionItem): { title: string; detail: string; when: string } {
    const relative = relativeDayLabel(item.daysUntil);
    if (item.kind === "installment") {
      const sale = sales.find((s) => s.id === item.saleId);
      const buyer = contactName(item.contactId);
      return {
        title: sale?.title ?? "Cuota de un pago",
        detail: buyer ? `Cuota de ${buyer}` : "Cuota pendiente",
        when: `Vencida ${relative.toLowerCase()}`
      };
    }
    if (item.kind === "followup") {
      const contact = contacts.find((c) => c.id === item.contactId);
      return {
        title: contact?.name ?? "Contacto",
        detail: contact?.leadStage
          ? `Seguimiento · ${labelFor(LEAD_STAGE, contact.leadStage)}`
          : "Seguimiento",
        when: relative
      };
    }
    const project = projects.find((p) => p.id === item.projectId);
    const client = contactName(item.contactId);
    return {
      title: project?.title ?? "Entrega",
      detail: client ? `Entrega para ${client}` : "Entrega",
      when: relative
    };
  }

  /* Tapping a row opens the thing itself, never a summary of it: the
     sale's detail sheet, the contact's sheet, the project's sheet. */
  function openItem(item: AttentionItem) {
    haptic.tap();
    if (item.kind === "installment" && item.saleId) {
      setSheet({ kind: "sale", id: item.saleId });
      return;
    }
    if (item.kind === "followup") {
      const contact = contacts.find((c) => c.id === item.contactId);
      if (contact) setSheet({ kind: "contact", contact });
      return;
    }
    const project = projects.find((p) => p.id === item.projectId);
    if (project) setSheet({ kind: "project", project });
  }

  function goTo(route: Route) {
    haptic.tap();
    navigate(route);
  }

  const netClass =
    pulse.net > 0 ? "dash-pulse-net--pos" : pulse.net < 0 ? "dash-pulse-net--neg" : "";
  const quietMonth = pulse.income === 0 && pulse.expenses === 0;
  // Nothing moved in the whole window: keep the chart (it's the shape of
  // the year) but collapse it to a baseline instead of framing 100px of
  // white as if data were missing.
  const flatTrend = chart.max === 0 && chart.min === 0;

  // The next expo only earns its own line when it isn't already the
  // next thing on her calendar.
  const nextExpo =
    snapshot.nextExpo && snapshot.nextExpo.id !== snapshot.nextEvent?.id ? snapshot.nextExpo : null;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{greetingFor()}</h1>
        <div className="dash-date">{formatDateLong(today)}</div>
      </div>

      {attention.length === 0 ? (
        <div className="section">
          <div className="card dash-calm list-entry-stagger" style={stagger(0)}>
            <span className="dash-calm-icon">
              <Icon name="check" size={18} strokeWidth={2.4} />
            </span>
            <div className="dash-calm-text">
              <div className="dash-calm-title">Todo al día</div>
              <div className="dash-calm-body">
                Nada vencido ni pendiente de respuesta. Sigue con lo tuyo.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="section">
          <div className="section-header">
            <span className="section-title">Necesita tu atención</span>
            <span className={`badge ${attention[0].daysUntil < 0 ? "badge-red" : "badge-amber"}`}>
              {attention.length}
            </span>
          </div>
          <div className="card">
            {attention.map((item, i) => {
              const urgency = urgencyOf(item.daysUntil);
              const { title, detail, when } = describe(item);
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`row-item list-entry-stagger dash-attn-row dash-attn-row--${urgency}`}
                  style={stagger(i)}
                  onClick={() => openItem(item)}
                >
                  <span className={`dash-attn-icon dash-attn-icon--${urgency}`}>
                    <Icon name={ATTENTION_ICON[item.kind]} size={17} />
                  </span>
                  <div className="row-content">
                    <div className="row-title">{title}</div>
                    {/* The timing never wraps or truncates — it's the
                        half of the line that tells her how bad it is.
                        A long client name ellipsizes instead. */}
                    <div className="row-sub row-sub-inline">
                      <span className="row-sub-detail">{detail}</span>
                      <span className="dash-attn-sep" aria-hidden="true">·</span>
                      <span className={`dash-attn-when dash-attn-when--${urgency}`}>{when}</span>
                    </div>
                  </div>
                  {/* Short form: cents on a dashboard row buy nothing and
                      cost the sub-line the width it needs. */}
                  {item.amount !== undefined && (
                    <span className="row-amount amount-owe">{formatMXNShort(item.amount)}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-header">
          <span className="section-title">Este mes</span>
          <span className="eyebrow">{formatMonthLong(today)}</span>
        </div>
        <div className="card dash-pulse">
          <div className={`dash-pulse-net ${netClass}`}>
            <AnimatedNumber value={pulse.net} format={formatMXNShortSigned} />
          </div>
          <div className="dash-pulse-caption">
            {quietMonth
              ? "Todavía no registras movimientos este mes"
              : pulse.net < 0
                ? "Gastaste más de lo que entró"
                : "Te quedó este mes"}
          </div>
          {delta && (
            <div className={`dash-pulse-delta dash-pulse-delta--${delta.direction}`}>
              <span className="dash-pulse-delta-arrow" aria-hidden="true">
                {delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "▬"}
              </span>
              {delta.direction === "flat"
                ? `Igual que ${monthName(delta.previousMonth)}`
                : `${formatMXNShort(delta.magnitude)} ${
                    delta.direction === "up" ? "más" : "menos"
                  } que ${monthName(delta.previousMonth)}`}
            </div>
          )}

          <div className="money-stats dash-pulse-stats">
            <div>
              <div className="money-stat-label">Entró</div>
              <div className="money-stat-value money-stat-value--paid">
                {formatMXNShort(pulse.income)}
              </div>
            </div>
            <div>
              <div className="money-stat-label">Salió</div>
              <div className="money-stat-value">{formatMXNShort(pulse.expenses)}</div>
            </div>
            <div>
              <div className="money-stat-label">Por cobrar</div>
              <div
                className={`money-stat-value ${
                  pulse.owed > 0 ? "money-stat-value--owed" : "money-stat-value--owed-soft"
                }`}
              >
                {pulse.owed > 0 ? formatMXNShort(pulse.owed) : "Nada"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-title">Cómo vienes</span>
          <span className="eyebrow">Últimos {TREND_MONTHS} meses</span>
        </div>
        <div className={`card dash-trend${flatTrend ? " dash-trend--flat" : ""}`}>
          <TrendBars chart={chart} />
          {flatTrend && (
            <div className="dash-trend-note">
              Aún no hay entradas ni gastos que graficar. En cuanto registres el primero, verás la
              forma de tu año aquí.
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-title">Tu taller</span>
        </div>
        <div className="card">
          <div className="dash-figures">
            <button type="button" className="dash-figure btn-tap" onClick={() => goTo("projects")}>
              <span className="dash-figure-label">En proceso</span>
              <span className="dash-figure-value">
                <AnimatedNumber value={snapshot.inProgress} />
              </span>
              <span className="dash-figure-meta">
                {snapshot.inProgress === 1 ? "pieza" : "piezas"}
              </span>
            </button>
            <button type="button" className="dash-figure btn-tap" onClick={() => goTo("projects")}>
              <span className="dash-figure-label">Guardadas</span>
              <span className="dash-figure-value">
                <AnimatedNumber value={snapshot.parked} />
              </span>
              <span className="dash-figure-meta">ideas y pausas</span>
            </button>
            <button type="button" className="dash-figure btn-tap" onClick={() => goTo("money")}>
              <span className="dash-figure-label">Vendidas</span>
              <span className="dash-figure-value">
                <AnimatedNumber value={snapshot.soldThisMonth} />
              </span>
              <span className="dash-figure-meta">
                {snapshot.soldThisMonth > 0
                  ? formatMXNShort(snapshot.soldThisMonthAmount)
                  : "este mes"}
              </span>
            </button>
          </div>

          {snapshot.nextEvent ? (
            <>
              <EventRow event={snapshot.nextEvent} lead="Próximo" onOpen={() => goTo("schedule")} />
              {nextExpo && (
                <EventRow event={nextExpo} lead="Próxima expo" onOpen={() => goTo("schedule")} />
              )}
            </>
          ) : (
            <button type="button" className="row-item" onClick={() => goTo("schedule")}>
              <div className="row-content">
                <div className="row-title">Nada agendado</div>
                <div className="row-sub">Agrega una clase, una expo o una entrega.</div>
              </div>
              <span className="row-chevron">
                <Icon name="chevron-right" size={16} />
              </span>
            </button>
          )}
        </div>
      </div>

      <QuickAddFab onPick={(action) => setSheet(QUICK_SHEET[action])} />

      {sheet?.kind === "sale" && (
        <SaleDetailSheet saleId={sheet.id} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === "newSale" && <SaleSheet sale={null} onClose={() => setSheet(null)} />}
      {sheet?.kind === "newExpense" && <ExpenseSheet expense={null} onClose={() => setSheet(null)} />}
      {sheet?.kind === "newEvent" && <EventSheet event={null} onClose={() => setSheet(null)} />}
      {sheet?.kind === "contact" && (
        <ContactSheet contact={sheet.contact} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === "project" && (
        <ProjectSheet project={sheet.project} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}

/* ── Trend ──
   Six bars over a zero baseline, hand-rolled. `chart.zeroLine` says
   where the baseline sits in the box and each bar's `height` is a
   fraction of that same box, so a bar above and a bar below the line
   are drawn at one shared scale. A month that netted exactly zero draws
   a flat tick rather than nothing, so a gap always means "no data". */
function TrendBars({ chart }: { chart: TrendChart }) {
  const { bars, zeroLine } = chart;
  const baseline = `${(1 - zeroLine) * 100}%`;
  const spoken = bars
    .map((bar) => `${monthName(bar.month)} ${formatMXNShortSigned(bar.net)}`)
    .join(", ");

  return (
    <div className="dash-chart">
      <div className="dash-chart-axis" aria-hidden="true">
        {chart.max > 0 && <span className="dash-chart-axis-max">{formatMXNShort(chart.max)}</span>}
        {zeroLine > 0 && zeroLine < 1 && (
          <span className="dash-chart-axis-zero" style={{ top: `${zeroLine * 100}%` }}>
            $0
          </span>
        )}
        {chart.min < 0 && (
          <span className="dash-chart-axis-min">{formatMXNShortSigned(chart.min)}</span>
        )}
      </div>
      <div className="dash-chart-plot">
        <div className="dash-chart-bars" role="img" aria-label={`Balance por mes: ${spoken}`}>
          <span className="dash-chart-zero" style={{ bottom: baseline }} />
          {bars.map((bar) => (
            <div className="dash-chart-col" key={bar.month}>
              {bar.height === 0 ? (
                <span className="dash-bar dash-bar--zero" style={{ bottom: baseline }} />
              ) : (
                <span
                  className={`dash-bar ${bar.positive ? "dash-bar--pos" : "dash-bar--neg"}${
                    bar.current ? " dash-bar--current" : ""
                  }`}
                  style={
                    bar.positive
                      ? { bottom: baseline, height: `${bar.height * 100}%` }
                      : { top: `${zeroLine * 100}%`, height: `${bar.height * 100}%` }
                  }
                />
              )}
            </div>
          ))}
        </div>
        <div className="dash-chart-labels" aria-hidden="true">
          {bars.map((bar) => (
            <span
              className={`dash-chart-label${bar.current ? " dash-chart-label--current" : ""}`}
              key={bar.month}
            >
              {monthInitial(bar.month)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function EventRow({
  event,
  lead,
  onOpen
}: {
  event: ScheduleEvent;
  lead: string;
  onOpen: () => void;
}) {
  const kind = EVENT_KIND.find((k) => k.value === event.kind);
  return (
    <button type="button" className="row-item" onClick={onOpen}>
      <span className="event-dot" style={{ background: kind?.color ?? "var(--charcoal-xl)" }} />
      <div className="row-content">
        <div className="row-title">{event.title}</div>
        <div className="row-sub">
          {lead} · {relativeDayLabel(daysUntil(event.date)).toLowerCase()}
          {event.startTime ? ` · ${event.startTime}` : ""}
        </div>
      </div>
      <span className="row-chevron">
        <Icon name="chevron-right" size={16} />
      </span>
    </button>
  );
}
