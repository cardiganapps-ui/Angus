import { useMemo, useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import type { ScheduleEvent } from "../types";
import { expoReport, type ExpoSignal } from "../utils/expo";
import { periodSummary } from "../utils/insights";
import { formatMXNShort, formatMXNShortSigned, sumMoney } from "../utils/money";
import { addMonths, formatWithWeekday, todayISO, yearRange } from "../utils/dates";
import { EmptyState } from "../components/EmptyState";
import { EventSheet } from "../components/EventSheet";
import { ExpoSheet } from "../components/ExpoSheet";
import { useFab } from "../context/FabContext";

const stagger = (i: number) => ({ "--stagger-i": Math.min(i, 12) }) as CSSProperties;

const SIGNAL_LABEL: Record<ExpoSignal, string> = {
  green: "Se pagó sola",
  amber: "Falta cobrar",
  red: "Costó más",
  none: "Sin datos"
};

/* ── Expos ──
   Every expo on the calendar with its economics: what it cost, what it
   sold, and a traffic light. Upcoming ones show budget vs spent so far. */
export function Expos() {
  const { events, sales, payments, expenses } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  useFab({ key: "expo", label: "Nueva expo", icon: "map-pin", onPick: () => setCreating(true) });
  const today = todayISO();

  // Average piece price over the last 12 months, for break-even math.
  const avgPrice = useMemo(() => {
    const from = addMonths(today, -12);
    return periodSummary(sales, payments, expenses, from, today).avgPiecePrice ?? periodSummary(sales, payments, expenses, yearRange("2000-01-01").from, today).avgPiecePrice;
  }, [sales, payments, expenses, today]);

  const expos = useMemo(() => events.filter((e) => e.kind === "expo" && !e.cancelled), [events]);
  const rows = useMemo(
    () =>
      expos
        .map((e) => ({ event: e, report: expoReport(e.id, e.budget, sales, payments, expenses, avgPrice) }))
        .sort((a, b) => b.event.date.localeCompare(a.event.date)),
    [expos, sales, payments, expenses, avgPrice]
  );
  const upcoming = rows.filter((r) => r.event.date >= today).reverse();
  const past = rows.filter((r) => r.event.date < today);
  const totalCash = sumMoney(past.map((r) => r.report.cash));

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">
          {expos.length} {expos.length === 1 ? "expo" : "expos"}
          {past.length > 0 ? ` · ${formatMXNShortSigned(totalCash)} en mano de las pasadas` : ""}
        </div>
        <h1 className="page-title">Expos</h1>
      </div>

      {expos.length === 0 ? (
        <div className="section">
          <div className="card">
            <EmptyState
              icon="map-pin"
              title="Sin expos todavía"
              body="Agrega una expo o feria a la agenda, ponle presupuesto y liga sus ventas y gastos. Angus te dice si valió la pena."
              actionLabel="Agregar expo"
              onAction={() => setCreating(true)}
            />
          </div>
        </div>
      ) : (
        <>
          <Section title="Próximas" rows={upcoming} onOpen={setOpen} emptyBody="Ninguna expo próxima en la agenda." upcoming />
          <Section title="Pasadas" rows={past} onOpen={setOpen} emptyBody="Todavía no tienes expos pasadas." />
        </>
      )}


      {creating && <EventSheet event={null} initialKind="expo" onClose={() => setCreating(false)} />}
      {open && <ExpoSheet eventId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Section({
  title,
  rows,
  onOpen,
  emptyBody,
  upcoming
}: {
  title: string;
  rows: { event: ScheduleEvent; report: ReturnType<typeof expoReport> }[];
  onOpen: (id: string) => void;
  emptyBody: string;
  upcoming?: boolean;
}) {
  return (
    <div className="section">
      <div className="section-header">
        <span className="section-title">{title}</span>
      </div>
      <div className="card">
        {rows.length === 0 ? (
          <div className="money-list-empty">{emptyBody}</div>
        ) : (
          rows.map(({ event, report }, i) => (
            <button key={event.id} type="button" className="row-item list-entry-stagger" style={stagger(i)} onClick={() => onOpen(event.id)}>
              <span className={`expo-signal expo-signal--${upcoming ? (report.budget && report.overBudget > 0 ? "red" : "none") : report.signal}`} aria-hidden="true" />
              <div className="row-content">
                <div className="row-title">{event.title}</div>
                <div className="row-sub">
                  {formatWithWeekday(event.date)}
                  {event.location ? ` · ${event.location}` : ""}
                  {upcoming
                    ? report.budget
                      ? ` · ${formatMXNShort(report.spent)} de ${formatMXNShort(report.budget)}`
                      : report.spent > 0
                        ? ` · gastado ${formatMXNShort(report.spent)}`
                        : " · sin presupuesto"
                    : ` · ${SIGNAL_LABEL[report.signal]}`}
                </div>
              </div>
              <div className="money-row-right">
                <span className={`row-amount ${report.cash > 0 ? "amount-paid" : report.cash < 0 ? "amount-owe" : "amount-clear"}`}>
                  {formatMXNShortSigned(report.cash)}
                </span>
                <span className="money-submeta">en mano</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
