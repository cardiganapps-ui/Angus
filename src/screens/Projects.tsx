import { useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import type { Project, ProjectStatus } from "../types";
import { PROJECT_STATUS, labelFor } from "../data/constants";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { ProjectSheet } from "../components/ProjectSheet";

/* Cardigan semantic badges: teal = active/in-progress, green = done,
   amber = on hold, purple = idea. */
const STATUS_BADGE: Record<ProjectStatus, string> = {
  idea: "badge-purple",
  in_progress: "badge-teal",
  on_hold: "badge-amber",
  completed: "badge-green"
};

export function Projects() {
  const { projects, contacts } = useApp();
  const [editing, setEditing] = useState<Project | null | "new">(null);

  const sorted = [...projects].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">{sorted.length} {sorted.length === 1 ? "proyecto" : "proyectos"}</div>
        <h1 className="page-title">Proyectos</h1>
      </div>

      <div className="section">
        {sorted.length === 0 ? (
          <div className="card">
            <EmptyState
              icon="palette"
              title="Sin proyectos todavía"
              body="Agrega una pieza, encargo o serie en la que estés trabajando."
            />
          </div>
        ) : (
          <div className="card">
            {sorted.map((project, i) => {
              const contact = contacts.find((c) => c.id === project.contactId);
              return (
                <button
                  key={project.id}
                  type="button"
                  className="row-item list-entry-stagger"
                  style={{ "--stagger-i": Math.min(i, 12) } as CSSProperties}
                  onClick={() => setEditing(project)}
                >
                  <div className="row-content">
                    <div className="row-title">{project.title}</div>
                    <div className="row-sub">
                      {project.medium}
                      {contact ? ` · ${contact.name}` : ""}
                    </div>
                  </div>
                  <span className={`badge ${STATUS_BADGE[project.status]}`}>
                    {labelFor(PROJECT_STATUS, project.status)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <button className="fab" onClick={() => setEditing("new")} aria-label="Nuevo proyecto">
        <Icon name="plus" size={24} strokeWidth={2.2} />
      </button>

      {editing && <ProjectSheet project={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
