import { useState } from "react";
import { useApp } from "../context/AppContext";
import type { Project, ProjectStatus } from "../types";
import { PROJECT_STATUS, labelFor } from "../data/constants";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { ProjectSheet } from "../components/ProjectSheet";

const STATUS_BADGE: Record<ProjectStatus, string> = {
  idea: "badge-plum",
  in_progress: "badge-clay",
  on_hold: "badge-amber",
  completed: "badge-sage"
};

export function Projects() {
  const { projects, contacts } = useApp();
  const [editing, setEditing] = useState<Project | null | "new">(null);

  const sorted = [...projects].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="page">
      <div className="topbar-title" style={{ marginBottom: 16 }}>
        Proyectos
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon="palette"
          title="Sin proyectos todavía"
          body="Agrega una pieza, encargo o serie en la que estés trabajando."
        />
      ) : (
        <div className="card">
          {sorted.map((project) => {
            const contact = contacts.find((c) => c.id === project.contactId);
            return (
              <button
                key={project.id}
                className="row-item"
                style={{ width: "100%", textAlign: "left" }}
                onClick={() => setEditing(project)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{project.title}</div>
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--charcoal-md)" }}>
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

      <button className="fab" onClick={() => setEditing("new")} aria-label="Nuevo proyecto">
        <Icon name="plus" size={24} />
      </button>

      {editing && <ProjectSheet project={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
