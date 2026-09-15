import { useMemo, useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import type { ScheduleEvent } from "../types";
import { EVENT_KIND, EVENT_KIND_BADGE, labelFor } from "../data/constants";
import { addDays, formatDateLong, formatMonthLong, formatWithWeekday, monthRange, parseISODate, relativeDayLabel, todayISO } from "../utils/dates";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { EventSheet } from "../components/EventSheet";
import { SegmentedControl } from "../components/SegmentedControl";
import { MonthGrid } from "../components/MonthGrid";

type View = "agenda" | "month";
let lastView: View = "agenda";
const VIEW_ITEMS = [
  { k: "agenda", l: "Agenda" },
  { k: "month", l: "Mes" }
];

const stagger = (i: number) => ({ "--stagger-i": Math.min(i, 12) }) as CSSProperties;

/* ── Agenda ──
   Two ways to look at the same calendar: a list grouped by day (today
   pinned, then this week, then by month) and a month grid whose tap
   filters the list below it. Cancelled series slots never show. */
export function Schedule() {
  const { events, courses } = useApp();
  const [view, setView] = useState<View>(lastView);
  const [editing, setEditing] = useState<ScheduleEvent | null | { newOn: string }>(null);
  const today = todayISO();
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(today);

  const live = useMemo(() => events.filter((e) => !e.cancelled), [events]);
  const sortEvents = (list: ScheduleEvent[]) =>
    [...list].sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));

  const upcoming = useMemo(() => sortEvents(live.filter((e) => e.date >= today)), [live, today]);
  const past = useMemo(() => sortEvents(live.filter((e) => e.date < today)).reverse(), [live, today]);
  const dayEvents = useMemo(() => sortEvents(live.filter((e) => e.date === selected)), [live, selected]);

  const courseName = (id: string | null) => (id ? (courses.find((c) => c.id === id)?.name ?? null) : null);

  function switchView(next: View) {
    lastView = next;
    setView(next);
  }

  // Group upcoming: Hoy · Esta semana · then by month.
  const groups = useMemo(() => {
    const weekEnd = addDays(today, 6);
    const out: { key: string; title: string; sub?: string; events: ScheduleEvent[] }[] = [];
    const byKey = new Map<string, (typeof out)[number]>();
    for (const e of upcoming) {
      let key: string;
      let title: string;
      let sub: string | undefined;
      if (e.date === today) {
        key = "today";
        title = "Hoy";
        sub = formatDateLong(today);
      } else if (e.date <= weekEnd) {
        key = "week";
        title = "Esta semana";
      } else {
        key = e.date.slice(0, 7);
        title = formatMonthLong(e.date);
      }
      let g = byKey.get(key);
      if (!g) {
        g = { key, title, sub, events: [] };
        byKey.set(key, g);
        out.push(g);
      }
      g.events.push(e);
    }
    return out;
  }, [upcoming, today]);

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">
          {upcoming.length} {upcoming.length === 1 ? "próximo" : "próximos"}
        </div>
        <h1 className="page-title">Agenda</h1>
      </div>

      <div className="money-switch">
        <SegmentedControl items={VIEW_ITEMS} value={view} onChange={(k) => switchView(k as View)} size="md" ariaLabel="Vista de la agenda" />
      </div>

      {view === "month" ? (
        <>
          <div className="section">
            <div className="card">
              <MonthGrid
                month={month}
                selected={selected}
                events={live.filter((e) => e.date >= addDays(monthRange(month).from, -7) && e.date <= addDays(monthRange(month).to, 14))}
                onSelect={setSelected}
                onMonthChange={setMonth}
              />
            </div>
          </div>
          <div className="section">
            <div className={`agenda-day ${selected === today ? "agenda-day--today" : ""}`} style={{ paddingLeft: 0, paddingRight: 0 }}>
              <span className="agenda-day-num">{parseISODate(selected).getDate()}</span>
              <span className="agenda-day-text">
                <span className="agenda-day-name">{formatDateLong(selected)}</span>
                <span className="agenda-day-sub">{relativeDayLabel(Math.round((parseISODate(selected).getTime() - parseISODate(today).getTime()) / 86_400_000))}</span>
              </span>
              <button type="button" className="see-all agenda-day-badge btn-tap" onClick={() => setEditing({ newOn: selected })}>
                + Agregar
              </button>
            </div>
            {dayEvents.length === 0 ? (
              <div className="card">
                <div className="money-list-empty">Nada agendado este día.</div>
              </div>
            ) : (
              <EventList events={dayEvents} onSelect={setEditing} showDate={false} courseName={courseName} />
            )}
          </div>
        </>
      ) : (
        <>
          {groups.length === 0 && (
            <div className="section">
              <div className="card">
                <EmptyState
                  icon="calendar"
                  title="Sin eventos próximos"
                  body="Agrega clases, expos, entregas, reuniones o pendientes personales. Una clase semanal se agenda sola."
                />
              </div>
            </div>
          )}
          {groups.map((g) => (
            <div className="section" key={g.key}>
              <div className="section-header">
                <span className="section-title">{g.title}</span>
                {g.sub && <span className="eyebrow">{g.sub}</span>}
              </div>
              <EventList events={g.events} onSelect={setEditing} showDate courseName={courseName} />
            </div>
          ))}
          {past.length > 0 && (
            <div className="section">
              <div className="section-header">
                <span className="section-title">Pasados</span>
              </div>
              <EventList events={past.slice(0, 12)} onSelect={setEditing} muted showDate courseName={courseName} />
            </div>
          )}
        </>
      )}

      <button className="fab" onClick={() => setEditing({ newOn: view === "month" ? selected : today })} aria-label="Nuevo evento">
        <Icon name="plus" size={24} strokeWidth={2.2} />
      </button>

      {editing && (
        <EventSheet
          event={"newOn" in editing ? null : editing}
          initialDate={"newOn" in editing ? editing.newOn : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function EventList({
  events,
  onSelect,
  muted,
  showDate,
  courseName
}: {
  events: ScheduleEvent[];
  onSelect: (e: ScheduleEvent) => void;
  muted?: boolean;
  showDate: boolean;
  courseName: (id: string | null) => string | null;
}) {
  return (
    <div className="card">
      {events.map((event, i) => {
        const kind = EVENT_KIND.find((k) => k.value === event.kind)!;
        const time = event.startTime ? `${event.startTime}${event.endTime ? `–${event.endTime}` : ""}` : "";
        return (
          <button
            key={event.id}
            type="button"
            className={`row-item list-entry-stagger ${muted ? "row-item--muted" : ""}`}
            style={stagger(i)}
            onClick={() => onSelect(event)}
          >
            <span className="event-dot" style={{ background: kind.color }} />
            <div className="row-content">
              <div className="row-title">
                {event.title}
                {event.seriesId && (
                  <span className="row-series" aria-label="Se repite" style={{ marginLeft: 6 }}>
                    <Icon name="repeat" size={12} strokeWidth={2.2} />
                  </span>
                )}
              </div>
              <div className="row-sub">
                {showDate ? formatWithWeekday(event.date) : ""}
                {showDate && time ? " · " : ""}
                {time}
                {event.location ? ` · ${event.location}` : ""}
                {event.courseId && courseName(event.courseId) && courseName(event.courseId) !== event.title
                  ? ` · ${courseName(event.courseId)}`
                  : ""}
                {event.missed ? " · no fuiste" : ""}
              </div>
            </div>
            <span className={`badge ${event.courseId ? "badge-purple" : EVENT_KIND_BADGE[event.kind]}`}>
              {event.courseId ? "Estudio" : labelFor(EVENT_KIND, event.kind)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
