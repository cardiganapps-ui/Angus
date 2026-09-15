import { useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import type { Assignment, Contact, Note, Project, QuickAction, ScheduleEvent } from "../types";
import type { Route } from "../hooks/useNavigation";
import { EVENT_KIND, LEAD_STAGE, labelFor } from "../data/constants";
import {
  attentionItems,
  goalProgress,
  moneyPulse,
  monthlyTrend,
  netDelta,
  practiceSnapshot,
  trendChart,
  type AttentionItem
} from "../utils/dashboard";
import { formatMXNShort, formatMXNShortSigned } from "../utils/money";
import { firstName } from "../utils/settings";
import { ProgressRing } from "../components/ProgressRing";
import { BarChart } from "../components/charts/BarChart";
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
import { AttendanceSheet } from "../components/AttendanceSheet";
import { AssignmentSheet } from "../components/AssignmentSheet";
import { QuickCaptureSheet } from "../components/notes/QuickCaptureSheet";
import { NoteEditor } from "../components/NoteEditor";
import { dueAssignments } from "../utils/studies";
import { useNotes } from "../hooks/useNotes";
import { notePreview, relativeTime } from "../utils/noteText";
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
  deadline: "clock",
  class: "graduation",
  assignment: "clipboard"
};

type OpenSheet =
  | { kind: "sale"; id: string }
  | { kind: "contact"; contact: Contact | null }
  | { kind: "project"; project: Project | null }
  | { kind: "assignment"; assignment: Assignment | null }
  | { kind: "quickNote" }
  | { kind: "note"; note: Note }
  | { kind: "newSale" }
  | { kind: "newExpense" }
  | { kind: "newEvent" }
  | { kind: "attendance"; groupId: string; eventId: string }
  | null;

const QUICK_SHEET: Record<QuickAction, OpenSheet> = {
  sale: { kind: "newSale" },
  expense: { kind: "newExpense" },
  event: { kind: "newEvent" },
  project: { kind: "project", project: null },
  contact: { kind: "contact", contact: null },
  assignment: { kind: "assignment", assignment: null },
  note: { kind: "quickNote" }
};

export function Home({ navigate }: { navigate: (route: Route) => void }) {
  const { sales, payments, installments, expenses, contacts, projects, events, settings, groups, attendance, courses, assignments } =
    useApp();
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const { notes, sessionNote } = useNotes();

  const today = todayISO();
  const attention = attentionItems(
    { sales, payments, installments, contacts, projects, events, groups, attendance, assignments },
    today
  );
  // Homework that isn't urgent yet still deserves a quiet line.
  const dueSoon = dueAssignments(assignments, today);
  const entregasSemana = dueSoon.today.length + dueSoon.soon.length;
  // The student block: today's class, the note she was last in.
  const studying = courses.some((c) => c.status === "active" || c.status === "upcoming");
  const todaySession = events
    .filter((e) => !e.cancelled && e.courseId !== null && e.date === today)
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""))[0];
  const lastNote = studying || notes.length > 0 ? [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] : undefined;
  const courseName = (id: string | null) => (id ? courses.find((c) => c.id === id)?.name : undefined);
  const pulse = moneyPulse(sales, payments, expenses, today);
  const delta = netDelta(pulse.netChange, today);
  const goal = goalProgress(pulse.income, settings.monthlyIncomeGoal);
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
    if (item.kind === "assignment") {
      const tarea = assignments.find((a) => a.id === item.assignmentId);
      const course = courses.find((c) => c.id === item.courseId);
      return {
        title: tarea?.title ?? "Tarea",
        detail: `Entregar · ${course?.name ?? "Curso"}`,
        when: item.daysUntil < 0 ? `Venció ${relative.toLowerCase()}` : relative
      };
    }
    if (item.kind === "class") {
      const group = groups.find((g) => g.id === item.groupId);
      const session = events.find((e) => e.id === item.eventId);
      return {
        title: "Pasar lista",
        detail: `${group?.name ?? "Clase"}${session?.startTime ? ` · ${session.startTime}` : ""}`,
        when: item.daysUntil === 0 ? "Hoy" : `Pendiente ${relative.toLowerCase()}`
      };
    }
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
    if (item.kind === "assignment") {
      const tarea = assignments.find((a) => a.id === item.assignmentId);
      if (tarea) setSheet({ kind: "assignment", assignment: tarea });
      return;
    }
    if (item.kind === "class" && item.groupId && item.eventId) {
      setSheet({ kind: "attendance", groupId: item.groupId, eventId: item.eventId });
      return;
    }
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
  // Today's class already headlines the Tus estudios card — don't list it twice.
  const shownInStudies = (studying || entregasSemana > 0) && todaySession ? todaySession.id : null;
  const nextAgenda = snapshot.nextEvent && snapshot.nextEvent.id !== shownInStudies ? snapshot.nextEvent : null;
  const nextStudy =
    snapshot.nextStudySession &&
    snapshot.nextStudySession.id !== snapshot.nextEvent?.id &&
    snapshot.nextStudySession.id !== shownInStudies
      ? snapshot.nextStudySession
      : null;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">
          {greetingFor()}
          {settings.artistName ? `, ${firstName(settings.artistName)}` : ""}
        </h1>
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

          {goal && (
            <div className={`dash-goal ${goal.reached ? "dash-goal--reached" : ""}`}>
              <ProgressRing
                ratio={goal.ratio}
                size={64}
                stroke={7}
                color={goal.reached ? "var(--green)" : "var(--accent)"}
                label={`Meta del mes: ${Math.round(goal.ratio * 100)} por ciento`}
              >
                {Math.round(goal.ratio * 100)}%
              </ProgressRing>
              <div className="dash-goal-text">
                <div className="dash-goal-title">
                  {goal.reached ? "Meta del mes cumplida" : "Meta del mes"}
                </div>
                <div className="dash-goal-sub">
                  {goal.reached
                    ? `Cobraste ${formatMXNShort(goal.collected)} de ${formatMXNShort(goal.goal)}. Bien hecho.`
                    : `${formatMXNShort(goal.collected)} de ${formatMXNShort(goal.goal)} · faltan ${formatMXNShort(goal.remaining)}`}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-title">Cómo vienes</span>
          <span className="eyebrow">Últimos {TREND_MONTHS} meses</span>
        </div>
        <div className={`card dash-trend${flatTrend ? " dash-trend--flat" : ""}`}>
          <BarChart
            series={[{ key: "net", label: "Balance", color: "var(--green)", negColor: "var(--red)" }]}
            columns={chart.bars.map((bar) => ({
              key: bar.month,
              label: monthInitial(bar.month),
              title: formatMonthLong(bar.month),
              values: { net: bar.net },
              current: bar.current
            }))}
            height={flatTrend ? 36 : 124}
            signed
            labelCurrent
            ariaLabel={`Balance por mes: ${chart.bars
              .map((bar) => `${monthName(bar.month)} ${formatMXNShortSigned(bar.net)}`)
              .join(", ")}`}
          />
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

          {nextAgenda || nextStudy || nextExpo ? (
            <>
              {nextAgenda && (
                <EventRow
                  event={nextAgenda}
                  lead={nextAgenda.courseId ? "Tu próxima clase" : "Próximo"}
                  onOpen={() => goTo(nextAgenda.courseId ? "studies" : "schedule")}
                />
              )}
              {nextStudy && <EventRow event={nextStudy} lead="Tu próxima clase" onOpen={() => goTo("studies")} />}
              {nextExpo && (
                <EventRow event={nextExpo} lead="Próxima expo" onOpen={() => goTo("schedule")} />
              )}
            </>
          ) : snapshot.nextEvent ? null : (
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

      {(studying || entregasSemana > 0) && (
        <div className="section">
          <div className="section-header">
            <span className="section-title">Tus estudios</span>
          </div>
          <div className="card">
            {todaySession && (
              <div className="row-item" style={{ cursor: "default" }}>
                <span className="event-dot" style={{ background: "var(--purple)" }} />
                <button type="button" className="row-content btn-tap" style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }} onClick={() => goTo("studies")}>
                  <div className="row-title">{courseName(todaySession.courseId) ?? todaySession.title}</div>
                  <div className="row-sub">
                    Hoy{todaySession.startTime ? ` · ${todaySession.startTime}` : ""}
                    {todaySession.location ? ` · ${todaySession.location}` : ""}
                  </div>
                </button>
                <button
                  type="button"
                  className={`row-icon-btn btn-tap ${notes.some((n) => n.eventId === todaySession.id) ? "row-icon-btn--on" : ""}`}
                  aria-label="Apuntes de hoy"
                  onClick={async () => {
                    haptic.tap();
                    const note = await sessionNote(todaySession);
                    if (note) setSheet({ kind: "note", note });
                  }}
                >
                  <Icon name="edit" size={16} strokeWidth={2.2} />
                </button>
              </div>
            )}
            {entregasSemana > 0 && (
              <button type="button" className="row-item" onClick={() => goTo("studies")}>
                <span className="event-dot" style={{ background: "var(--red)" }} />
                <div className="row-content">
                  <div className="row-title">
                    {entregasSemana} {entregasSemana === 1 ? "entrega" : "entregas"} esta semana
                  </div>
                  <div className="row-sub">
                    {dueSoon.today.length > 0
                      ? `${dueSoon.today.length} ${dueSoon.today.length === 1 ? "vence hoy" : "vencen hoy"}`
                      : `La primera: ${dueSoon.soon[0]?.title ?? ""}`}
                  </div>
                </div>
                <span className="row-chevron">
                  <Icon name="chevron-right" size={16} />
                </span>
              </button>
            )}
            {lastNote ? (
              <button type="button" className="row-item" onClick={() => setSheet({ kind: "note", note: lastNote })}>
                <span className="event-dot" style={{ background: "var(--accent)" }} />
                <div className="row-content">
                  <div className="row-title">{lastNote.title || "Sin título"}</div>
                  <div className="row-sub">Sigue con tu nota · {relativeTime(lastNote.updatedAt)}{notePreview(lastNote.content, 60) ? ` · ${notePreview(lastNote.content, 60)}` : ""}</div>
                </div>
                <span className="row-chevron">
                  <Icon name="chevron-right" size={16} />
                </span>
              </button>
            ) : (
              !todaySession &&
              entregasSemana === 0 && (
                <button type="button" className="row-item" onClick={() => goTo("notes")}>
                  <div className="row-content">
                    <div className="row-title">Sin apuntes todavía</div>
                    <div className="row-sub">Toca el lápiz en una sesión o escribe una nota rápida.</div>
                  </div>
                  <span className="row-chevron">
                    <Icon name="chevron-right" size={16} />
                  </span>
                </button>
              )
            )}
          </div>
        </div>
      )}

      <QuickAddFab onPick={(action) => setSheet(QUICK_SHEET[action])} />

      {sheet?.kind === "sale" && (
        <SaleDetailSheet saleId={sheet.id} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === "newSale" && <SaleSheet sale={null} onClose={() => setSheet(null)} />}
      {sheet?.kind === "newExpense" && <ExpenseSheet expense={null} onClose={() => setSheet(null)} />}
      {sheet?.kind === "newEvent" && <EventSheet event={null} onClose={() => setSheet(null)} />}
      {sheet?.kind === "attendance" &&
        (() => {
          const group = groups.find((g) => g.id === sheet.groupId);
          const session = events.find((e) => e.id === sheet.eventId);
          return group && session ? (
            <AttendanceSheet group={group} session={session} onClose={() => setSheet(null)} />
          ) : null;
        })()}
      {sheet?.kind === "contact" && (
        <ContactSheet contact={sheet.contact} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === "project" && (
        <ProjectSheet project={sheet.project} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === "assignment" && (
        <AssignmentSheet assignment={sheet.assignment} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === "quickNote" && (
        <QuickCaptureSheet
          onClose={() => setSheet((s) => (s?.kind === "quickNote" ? null : s))}
          onSaved={(note, { openInEditor }) => {
            if (openInEditor) setSheet({ kind: "note", note });
          }}
        />
      )}
      {sheet?.kind === "note" && <NoteEditor key={sheet.note.id} note={sheet.note} onClose={() => setSheet(null)} />}
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
