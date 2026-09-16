import { useMemo, useState, type CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import type { Availability, Project, ProjectStatus } from "../types";
import {
  AVAILABILITY,
  AVAILABILITY_BADGE,
  PROJECT_STATUS,
  PROJECT_STATUS_BADGE,
  labelFor
} from "../data/constants";
import { formatMXNShort } from "../utils/money";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { ProjectSheet } from "../components/ProjectSheet";
import { SearchField } from "../components/SearchField";
import { matches } from "../utils/text";
import { SegmentedControl } from "../components/SegmentedControl";
import { haptic } from "../lib/haptics";

type Sort = "recent" | "title" | "price";
type StatusFilter = "all" | ProjectStatus;
type AvailFilter = "all" | Availability;

const SORT_ITEMS = [
  { k: "recent", l: "Recientes" },
  { k: "title", l: "Título" },
  { k: "price", l: "Precio" }
];

const stagger = (i: number) => ({ "--stagger-i": Math.min(i, 12) }) as CSSProperties;

/* ── Obra ──
   Her inventory. Search by title / medium / location, filter by
   production status and availability, sort. Grouped by status so
   "what am I working on" is the first thing on screen. */
export function Projects() {
  const { projects, contacts, courses } = useApp();
  const [editing, setEditing] = useState<Project | null | "new">(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [avail, setAvail] = useState<AvailFilter>("all");
  const [sort, setSort] = useState<Sort>("recent");

  const filtered = useMemo(() => {
    let list = projects;
    if (query.trim()) {
      list = list.filter((p) => matches(`${p.title} ${p.medium} ${p.location} ${p.edition}`, query));
    }
    if (status !== "all") list = list.filter((p) => p.status === status);
    if (avail !== "all") list = list.filter((p) => p.availability === avail);
    return [...list].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "price") return (b.price ?? -1) - (a.price ?? -1) || a.title.localeCompare(b.title);
      return b.createdAt.localeCompare(a.createdAt) || a.title.localeCompare(b.title);
    });
  }, [projects, query, status, avail, sort]);

  // Grouped by status in a fixed order when no status filter is set.
  const groups = useMemo(() => {
    if (status !== "all" || sort !== "recent") return [{ key: "all", title: null as string | null, items: filtered }];
    const order: ProjectStatus[] = ["in_progress", "idea", "on_hold", "completed"];
    return order
      .map((st) => ({ key: st, title: labelFor(PROJECT_STATUS, st), items: filtered.filter((p) => p.status === st) }))
      .filter((g) => g.items.length > 0);
  }, [filtered, status, sort]);

  const available = projects.filter((p) => p.availability === "available").length;
  const filtering = query.trim() !== "" || status !== "all" || avail !== "all";

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">
          {projects.length} {projects.length === 1 ? "pieza" : "piezas"}
          {available > 0 ? ` · ${available} ${available === 1 ? "disponible" : "disponibles"}` : ""}
        </div>
        <h1 className="page-title">Obra</h1>
      </div>

      {projects.length > 0 && (
        <>
          <SearchField value={query} onChange={setQuery} placeholder="Buscar por título, medio, lugar…" ariaLabel="Buscar piezas" />
          <div className="filter-row" role="group" aria-label="Filtrar por estado">
            <FilterChip active={status === "all"} onClick={() => setStatus("all")}>Todas</FilterChip>
            {PROJECT_STATUS.map((s) => (
              <FilterChip key={s.value} active={status === s.value} onClick={() => setStatus(s.value)}>
                {s.label}
              </FilterChip>
            ))}
          </div>
          <div className="filter-row" role="group" aria-label="Filtrar por disponibilidad">
            <FilterChip active={avail === "all"} onClick={() => setAvail("all")}>Cualquier estado</FilterChip>
            {AVAILABILITY.map((a) => (
              <FilterChip key={a.value} active={avail === a.value} onClick={() => setAvail(a.value)}>
                {a.label}
              </FilterChip>
            ))}
          </div>
          <div className="money-switch" style={{ marginTop: 0 }}>
            <SegmentedControl items={SORT_ITEMS} value={sort} onChange={(k) => setSort(k as Sort)} size="sm" ariaLabel="Ordenar" />
          </div>
        </>
      )}

      {projects.length === 0 ? (
        <div className="section">
          <div className="card">
            <EmptyState
              icon="palette"
              title="Sin piezas todavía"
              body="Agrega una pieza, encargo o serie en la que estés trabajando. Con medida, año y lugar tendrás tu inventario completo."
              actionLabel="Agregar pieza"
              onAction={() => setEditing("new")}
            />
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="section">
          <div className="card">
            <EmptyState icon="search" title="Nada coincide" body="Prueba con otra palabra o quita los filtros." />
          </div>
        </div>
      ) : (
        groups.map((g) => (
          <div className="section" key={g.key}>
            {g.title && (
              <div className="section-header">
                <span className="section-title">{g.title}</span>
                <span className="pipeline-stage-count">{g.items.length}</span>
              </div>
            )}
            <div className="card">
              {g.items.map((project, i) => {
                const contact = contacts.find((c) => c.id === project.contactId);
                const course = project.courseId ? courses.find((c) => c.id === project.courseId) : undefined;
                const meta = [project.medium, project.dimensions, project.year ? String(project.year) : "", contact?.name ?? "", course ? `Para ${course.name}` : ""]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <button
                    key={project.id}
                    type="button"
                    className="row-item list-entry-stagger"
                    style={stagger(i)}
                    onClick={() => setEditing(project)}
                  >
                    <div className="row-content">
                      <div className="row-title">{project.title}</div>
                      <div className="row-sub">{meta || "Sin detalles"}</div>
                    </div>
                    <div className="money-row-right">
                      <span className="money-badges">
                        {(filtering || g.title === null) && (
                          <span className={`badge ${PROJECT_STATUS_BADGE[project.status]}`}>
                            {labelFor(PROJECT_STATUS, project.status)}
                          </span>
                        )}
                        {project.availability !== "available" && (
                          <span className={`badge ${AVAILABILITY_BADGE[project.availability]}`}>
                            {labelFor(AVAILABILITY, project.availability)}
                          </span>
                        )}
                        {course && <span className="badge badge-purple">Curso</span>}
                      </span>
                      {project.price !== null && <span className="row-amount">{formatMXNShort(project.price)}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}

      <button className="fab" onClick={() => setEditing("new")} aria-label="Nueva pieza">
        <Icon name="plus" size={24} strokeWidth={2.2} />
      </button>

      {editing && <ProjectSheet project={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={`chip ${active ? "active" : ""}`}
      aria-pressed={active}
      onClick={() => {
        haptic.tap();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
