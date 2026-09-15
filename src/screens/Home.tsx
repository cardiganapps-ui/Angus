import { useApp } from "../context/AppContext";
import { EVENT_KIND, labelFor } from "../data/constants";
import { formatWithWeekday, todayISO } from "../utils/dates";
import { EmptyState } from "../components/EmptyState";

export function Home() {
  const { events, projects, contacts } = useApp();

  const upcoming = events
    .filter((e) => e.date >= todayISO())
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""))
    .slice(0, 5);

  const activeProjects = projects.filter((p) => p.status === "in_progress").length;
  const dueFollowUps = contacts.filter(
    (c) => c.followUpDate && c.followUpDate <= todayISO()
  ).length;

  return (
    <div className="page">
      <div className="eyebrow">Hola</div>
      <div className="topbar-title" style={{ marginBottom: 20 }}>
        Tu día
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <div className="kpi-card" style={{ flex: 1 }}>
          <div className="eyebrow">Proyectos activos</div>
          <div className="kpi-value">{activeProjects}</div>
        </div>
        <div className="kpi-card" style={{ flex: 1 }}>
          <div className="eyebrow">Seguimientos</div>
          <div className="kpi-value">{dueFollowUps}</div>
        </div>
      </div>

      <div className="section-title">Próximos eventos</div>
      {upcoming.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="Nada agendado"
          body="Cuando agregues clases, expos o entregas, aparecerán aquí."
        />
      ) : (
        <div className="card">
          {upcoming.map((event) => {
            const kind = EVENT_KIND.find((k) => k.value === event.kind)!;
            return (
              <div className="row-item" key={event.id}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: kind.color,
                    flexShrink: 0
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{event.title}</div>
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--charcoal-md)" }}>
                    {formatWithWeekday(event.date)}
                    {event.startTime ? ` · ${event.startTime}` : ""}
                  </div>
                </div>
                <span className={`badge badge-neutral`}>{labelFor(EVENT_KIND, event.kind)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
