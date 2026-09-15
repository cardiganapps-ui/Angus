import { useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import type { ScheduleEvent } from "../types";
import { EVENT_KIND, EVENT_KIND_BADGE, labelFor } from "../data/constants";
import { formatWithWeekday, todayISO } from "../utils/dates";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { EventSheet } from "../components/EventSheet";

export function Schedule() {
  const { events } = useApp();
  const [editing, setEditing] = useState<ScheduleEvent | null | "new">(null);
  const today = todayISO();

  const upcoming = [...events]
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  const past = [...events]
    .filter((e) => e.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">{upcoming.length} {upcoming.length === 1 ? "próximo" : "próximos"}</div>
        <h1 className="page-title">Agenda</h1>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-title">Próximos</span>
        </div>
        {upcoming.length === 0 ? (
          <div className="card">
            <EmptyState
              icon="calendar"
              title="Sin eventos próximos"
              body="Agrega clases, expos, entregas, reuniones o pendientes personales."
            />
          </div>
        ) : (
          <EventList events={upcoming} onSelect={setEditing} />
        )}
      </div>

      {past.length > 0 && (
        <div className="section">
          <div className="section-header">
            <span className="section-title">Pasados</span>
          </div>
          <EventList events={past} onSelect={setEditing} muted />
        </div>
      )}

      <button className="fab" onClick={() => setEditing("new")} aria-label="Nuevo evento">
        <Icon name="plus" size={24} strokeWidth={2.2} />
      </button>

      {editing && <EventSheet event={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EventList({
  events,
  onSelect,
  muted
}: {
  events: ScheduleEvent[];
  onSelect: (e: ScheduleEvent) => void;
  muted?: boolean;
}) {
  return (
    <div className="card">
      {events.map((event, i) => {
        const kind = EVENT_KIND.find((k) => k.value === event.kind)!;
        return (
          <button
            key={event.id}
            type="button"
            className={`row-item list-entry-stagger ${muted ? "row-item--muted" : ""}`}
            style={{ "--stagger-i": Math.min(i, 12) } as CSSProperties}
            onClick={() => onSelect(event)}
          >
            <span className="event-dot" style={{ background: kind.color }} />
            <div className="row-content">
              <div className="row-title">{event.title}</div>
              <div className="row-sub">
                {formatWithWeekday(event.date)}
                {event.startTime ? ` · ${event.startTime}` : ""}
                {event.location ? ` · ${event.location}` : ""}
              </div>
            </div>
            <span className={`badge ${EVENT_KIND_BADGE[event.kind]}`}>{labelFor(EVENT_KIND, event.kind)}</span>
          </button>
        );
      })}
    </div>
  );
}
