import { useApp } from "../context/AppContext";
import { EVENT_KIND, EVENT_KIND_BADGE, labelFor } from "../data/constants";
import { formatWithWeekday, todayISO } from "../utils/dates";
import { EmptyState } from "../components/EmptyState";

export function Home() {
  const { events, projects, contacts } = useApp();
  const today = todayISO();

  const upcoming = events
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""))
    .slice(0, 5);

  const activeProjects = projects.filter((p) => p.status === "in_progress").length;
  const dueFollowUps = contacts.filter(
    (c) => c.followUpDate && c.followUpDate <= today
  ).length;

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">{formatWithWeekday(today)}</div>
        <h1 className="page-title">Tu día</h1>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Proyectos activos</div>
          <div className="kpi-value">{activeProjects}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Seguimientos</div>
          <div className="kpi-value">{dueFollowUps}</div>
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
            {upcoming.map((event) => {
              const kind = EVENT_KIND.find((k) => k.value === event.kind)!;
              return (
                <div className="row-item" key={event.id}>
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
    </div>
  );
}
