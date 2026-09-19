import { useMemo, useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import type { Assignment, ScheduleEvent } from "../types";
import { EVENT_KIND, EVENT_KIND_BADGE, labelFor } from "../data/constants";
import { addDays, formatDateLong, formatMonthLong, formatWithWeekday, monthRange, parseISODate, relativeDayLabel, todayISO } from "../utils/dates";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { SwipeRow } from "../components/SwipeRow";
import { useToast } from "../context/ToastContext";
import { EventSheet } from "../components/EventSheet";
import { AssignmentSheet } from "../components/AssignmentSheet";
import { dueLabel } from "../utils/studies";
import { SegmentedControl } from "../components/SegmentedControl";
import { MonthGrid } from "../components/MonthGrid";
import { useFab } from "../context/FabContext";

type View = "agenda" | "month";
let lastView: View = "agenda";
const VIEW_ITEMS = [
  { k: "agenda", l: "Agenda" },
  { k: "month", l: "Mes" }
];

const stagger = (i: number) => ({ "--stagger-i": Math.min(i, 12) }) as CSSProperties;

/* A day's list mixes real events with the tareas due that day. Tareas
   are never stored as events — one source of truth — so the agenda
   builds these rows on the fly. */
type AgendaItem = { kind: "event"; date: string; time: string; event: ScheduleEvent } | { kind: "tarea"; date: string; time: string; tarea: Assignment };

const itemKey = (i: AgendaItem) => (i.kind === "event" ? i.event.id : `tarea:${i.tarea.id}`);
const sortItems = (list: AgendaItem[]) =>
  [...list].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

/* ── Agenda ──
   Two ways to look at the same calendar: a list grouped by day (today
   pinned, then this week, then by month) and a month grid whose tap
   filters the list below it. Cancelled series slots never show. */
export function Schedule() {
  const { events, courses, assignments, removeEvent, updateEvent, removeAssignment } = useApp();
  const { showSuccess } = useToast();
  /* Swipe deletes ONE thing. A series slot is cancelled rather than
     deleted (the generator would put a deleted one straight back — same
     as EventSheet's "Solo este"); the whole series is still edited from
     the sheet. A tarea row is virtual, so it removes the tarea itself. */
  const deleteItem = async (item: AgendaItem) => {
    let ok: boolean;
    if (item.kind === "tarea") {
      ok = await removeAssignment(item.tarea.id);
      if (ok) showSuccess("Tarea eliminada");
    } else if (item.event.seriesId) {
      ok = await updateEvent(item.event.id, { cancelled: true });
      if (ok) showSuccess("Sesión eliminada");
    } else {
      ok = await removeEvent(item.event.id);
      if (ok) showSuccess("Evento eliminado");
    }
    return ok;
  };
  const [view, setView] = useState<View>(lastView);
  const [editing, setEditing] = useState<ScheduleEvent | null | { newOn: string }>(null);
  const [tarea, setTarea] = useState<Assignment | null>(null);
  const today = todayISO();
  const [selected, setSelected] = useState(today);
  useFab({ key: "event", label: "Nuevo evento", icon: "calendar", onPick: () => setEditing({ newOn: view === "month" ? selected : today }) });
  const [month, setMonth] = useState(today);

  const live = useMemo(() => events.filter((e) => !e.cancelled), [events]);
  const eventItems = useMemo(
    () => live.map((e): AgendaItem => ({ kind: "event", date: e.date, time: e.startTime ?? "", event: e })),
    [live]
  );
  // Open tareas with a date. Overdue ones surface under Hoy so a missed
  // entrega can't hide in the past.
  const tareaItems = useMemo(
    () =>
      assignments
        .filter((a) => a.status !== "done" && a.dueDate !== null)
        .map((a): AgendaItem => ({ kind: "tarea", date: (a.dueDate as string) < today ? today : (a.dueDate as string), time: a.dueTime ?? "~", tarea: a })),
    [assignments, today]
  );

  const upcoming = useMemo(
    () => sortItems([...eventItems.filter((i) => i.date >= today), ...tareaItems]),
    [eventItems, tareaItems, today]
  );
  const past = useMemo(() => sortItems(eventItems.filter((i) => i.date < today)).reverse(), [eventItems, today]);
  const dayItems = useMemo(
    () => sortItems([...eventItems, ...tareaItems].filter((i) => i.date === selected)),
    [eventItems, tareaItems, selected]
  );
  const marks = useMemo(
    () => tareaItems.map((i) => ({ date: i.date, color: "var(--red)" })),
    [tareaItems]
  );

  const courseName = (id: string | null) => (id ? (courses.find((c) => c.id === id)?.name ?? null) : null);

  function switchView(next: View) {
    lastView = next;
    setView(next);
  }

  function open(item: AgendaItem) {
    if (item.kind === "event") setEditing(item.event);
    else setTarea(item.tarea);
  }

  // Group upcoming: Hoy · Esta semana · then by month.
  const groups = useMemo(() => {
    const weekEnd = addDays(today, 6);
    const out: { key: string; title: string; sub?: string; items: AgendaItem[] }[] = [];
    const byKey = new Map<string, (typeof out)[number]>();
    for (const item of upcoming) {
      let key: string;
      let title: string;
      let sub: string | undefined;
      if (item.date === today) {
        key = "today";
        title = "Hoy";
        sub = formatDateLong(today);
      } else if (item.date <= weekEnd) {
        key = "week";
        title = "Esta semana";
      } else {
        key = item.date.slice(0, 7);
        title = formatMonthLong(item.date);
      }
      let g = byKey.get(key);
      if (!g) {
        g = { key, title, sub, items: [] };
        byKey.set(key, g);
        out.push(g);
      }
      g.items.push(item);
    }
    return out;
  }, [upcoming, today]);

  const upcomingEvents = upcoming.filter((i) => i.kind === "event").length;

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">
          {upcomingEvents} {upcomingEvents === 1 ? "próximo" : "próximos"}
          {tareaItems.length > 0 ? ` · ${tareaItems.length} ${tareaItems.length === 1 ? "entrega" : "entregas"}` : ""}
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
                marks={marks}
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
            {dayItems.length === 0 ? (
              <div className="card">
                <div className="money-list-empty">Nada agendado este día.</div>
              </div>
            ) : (
              <AgendaList items={dayItems} onSelect={open} onDelete={deleteItem} showDate={false} courseName={courseName} today={today} />
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
                  actionLabel="Agregar evento"
                  onAction={() => setEditing({ newOn: today })}
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
              <AgendaList items={g.items} onSelect={open} onDelete={deleteItem} showDate courseName={courseName} today={today} />
            </div>
          ))}
          {past.length > 0 && (
            <div className="section">
              <div className="section-header">
                <span className="section-title">Pasados</span>
              </div>
              <AgendaList items={past.slice(0, 12)} onSelect={open} onDelete={deleteItem} muted showDate courseName={courseName} today={today} />
            </div>
          )}
        </>
      )}


      {editing && (
        <EventSheet
          event={"newOn" in editing ? null : editing}
          initialDate={"newOn" in editing ? editing.newOn : undefined}
          onClose={() => setEditing(null)}
        />
      )}
      {tarea && <AssignmentSheet assignment={tarea} onClose={() => setTarea(null)} />}
    </div>
  );
}

function AgendaList({
  items,
  onSelect,
  onDelete,
  muted,
  showDate,
  courseName,
  today
}: {
  items: AgendaItem[];
  onSelect: (item: AgendaItem) => void;
  onDelete: (item: AgendaItem) => Promise<boolean>;
  muted?: boolean;
  showDate: boolean;
  courseName: (id: string | null) => string | null;
  today: string;
}) {
  return (
    <div className="card">
      {items.map((item, i) => {
        if (item.kind === "tarea") {
          const due = dueLabel(item.tarea, today);
          const course = courseName(item.tarea.courseId);
          return (
            <SwipeRow
              key={itemKey(item)}
              label={item.tarea.title}
              question={`¿Eliminar la tarea “${item.tarea.title}”? La pieza ligada se conserva.`}
              onDelete={() => onDelete(item)}
            >
            <button
              type="button"
              className="row-item list-entry-stagger"
              style={stagger(i)}
              onClick={() => onSelect(item)}
            >
              <span className="event-dot" style={{ background: "var(--red)" }} />
              <div className="row-content">
                <div className="row-title">{item.tarea.title}</div>
                <div className="row-sub">
                  {showDate && due.tone !== "overdue" ? `${formatWithWeekday(item.tarea.dueDate as string)}${item.tarea.dueTime ? ` ${item.tarea.dueTime}` : ""} · ` : ""}
                  {due.tone === "overdue" ? (
                    <span className="task-due task-due--overdue">{due.text} · </span>
                  ) : !showDate && item.tarea.dueTime ? (
                    `${item.tarea.dueTime} · `
                  ) : (
                    ""
                  )}
                  Entregar{course ? ` · ${course}` : ""}
                </div>
              </div>
              <span className="badge badge-red">Tarea</span>
            </button>
            </SwipeRow>
          );
        }
        const event = item.event;
        const kind = EVENT_KIND.find((k) => k.value === event.kind)!;
        const time = event.startTime ? `${event.startTime}${event.endTime ? `–${event.endTime}` : ""}` : "";
        return (
          <SwipeRow
            key={itemKey(item)}
            label={event.title}
            question={
              event.seriesId
                ? `¿Quitar esta sesión de “${event.title}”? Solo esta fecha; la serie sigue.`
                : undefined
            }
            onDelete={() => onDelete(item)}
          >
          <button
            type="button"
            className={`row-item list-entry-stagger ${muted ? "row-item--muted" : ""}`}
            style={stagger(i)}
            onClick={() => onSelect(item)}
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
          </SwipeRow>
        );
      })}
    </div>
  );
}
