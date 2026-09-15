import { useState } from "react";
import { useApp } from "../context/AppContext";
import type { ScheduleEvent } from "../types";
import { EVENT_KIND, labelFor } from "../data/constants";
import { formatWithWeekday, todayISO } from "../utils/dates";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { EventSheet } from "../components/EventSheet";

export function Schedule() {
  const { events } = useApp();
  const [editing, setEditing] = useState<ScheduleEvent | null | "new">(null);

  const upcoming = [...events]
    .filter((e) => e.date >= todayISO())
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  const past = [...events]
    .filter((e) => e.date < todayISO())
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="page">
      <div className="topbar-title" style={{ marginBottom: 16 }}>
        Agenda
      </div>

      {upcoming.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="Sin eventos próximos"
          body="Agrega clases, expos, entregas, reuniones o pendientes personales."
        />
      ) : (
        <EventList events={upcoming} onSelect={setEditing} />
      )}

      {past.length > 0 && (
        <>
          <div className="section-title">Pasados</div>
          <EventList events={past} onSelect={setEditing} muted />
        </>
      )}

      <button className="fab" onClick={() => setEditing("new")} aria-label="Nuevo evento">
        <Icon name="plus" size={24} />
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
    <div className="card" style={muted ? { opacity: 0.7 } : undefined}>
      {events.map((event) => {
        const kind = EVENT_KIND.find((k) => k.value === event.kind)!;
        return (
          <button
            key={event.id}
            className="row-item"
            style={{ width: "100%", textAlign: "left" }}
            onClick={() => onSelect(event)}
          >
            <span
              style={{ width: 8, height: 8, borderRadius: "50%", background: kind.color, flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{event.title}</div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--charcoal-md)" }}>
                {formatWithWeekday(event.date)}
                {event.startTime ? ` · ${event.startTime}` : ""}
                {event.location ? ` · ${event.location}` : ""}
              </div>
            </div>
            <span className="badge badge-neutral">{labelFor(EVENT_KIND, event.kind)}</span>
          </button>
        );
      })}
    </div>
  );
}
