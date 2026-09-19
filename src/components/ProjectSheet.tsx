import { useId, useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { Availability, Project, ProjectStatus } from "../types";
import { AVAILABILITY, MEDIUM_SUGGESTIONS, PROJECT_STATUS } from "../data/constants";
import { ChipSelect } from "./ChipSelect";
import { suggestMediums } from "../utils/settings";
import { Sheet } from "./Sheet";
import { SheetActions } from "./SheetActions";
import { SegmentedControl } from "./SegmentedControl";
import { PickerField } from "./PickerField";
import { Icon } from "./Icon";
import { useQuickCreate } from "../hooks/useQuickCreate";
import { domId, makeId } from "../utils/id";
import { useDirtyGuard } from "../hooks/useDirtyGuard";
import { todayISO } from "../utils/dates";
import { projectMargins } from "../utils/accounting";
import { formatMXNShort, formatMXNShortSigned } from "../utils/money";
import { useDocuments } from "../hooks/useDocuments";
import { DocumentList } from "./DocumentList";
import { DocumentViewer } from "./DocumentViewer";
import { UploadSheet } from "./UploadSheet";
import type { Document } from "../types";
import { haptic } from "../lib/haptics";
import { prefersAutoFocus } from "../lib/device";

const STATUS_ITEMS = PROJECT_STATUS.map((s) => ({ k: s.value, l: s.label }));

export function ProjectSheet({
  project,
  initialTitle,
  initialCourseId,
  onClose,
  onCreated
}: {
  project: Project | null;
  initialTitle?: string;
  /** Pre-links a new piece to a course she takes (a tarea's piece). */
  initialCourseId?: string;
  onClose: () => void;
  /** Called with the new id after a create instead of onClose, so the caller can pick it. */
  onCreated?: (id: string) => void;
}) {
  const { addProject, updateProject, removeProject, contacts, courses, sales, payments, expenses, projects, settings } =
    useApp();
  const quick = useQuickCreate();
  const { showSuccess } = useToast();
  const [title, setTitle] = useState(project?.title ?? initialTitle ?? "");
  const [medium, setMedium] = useState(project?.medium ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "idea");
  const [startDate, setStartDate] = useState(project?.startDate ?? "");
  const [dueDate, setDueDate] = useState(project?.dueDate ?? "");
  const [price, setPrice] = useState(project?.price?.toString() ?? "");
  const [availability, setAvailability] = useState<Availability>(project?.availability ?? "available");
  const [cost, setCost] = useState(project?.cost?.toString() ?? "");
  const [dimensions, setDimensions] = useState(project?.dimensions ?? "");
  const [year, setYear] = useState(project?.year?.toString() ?? "");
  const [edition, setEdition] = useState(project?.edition ?? "");
  const [location, setLocation] = useState(project?.location ?? "");
  const [showSheet, setShowSheet] = useState(!!project && !!(project.dimensions || project.year || project.edition || project.location));
  const [contactId, setContactId] = useState(project?.contactId ?? "");
  const [courseId, setCourseId] = useState(project?.courseId ?? initialCourseId ?? "");
  const [notes, setNotes] = useState(project?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const { documentsFor, remove: removeDocument } = useDocuments();
  const [docOpen, setDocOpen] = useState<Document | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const photos = project ? documentsFor({ projectId: project.id }) : [];

  const uid = domId(useId());
  const dirty = useDirtyGuard({
    title, medium, status, startDate, dueDate, price, availability, cost,
    dimensions, year, edition, location, contactId, courseId, notes
  });

  const safeClose = submitting ? null : onClose;
  const canSave = title.trim().length > 0;
  const mediumChips = [...new Set([...settings.mediums, ...suggestMediums(projects)])].slice(0, 6);
  const contactOptions = [...contacts]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: c.name }));
  const courseOptions = courses
    .filter((c) => c.status === "active" || c.status === "upcoming" || c.id === courseId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: c.name }));
  // Only for a piece that already has money attached — a brand-new one
  // has nothing to report, and an empty band would just add weight.
  const linkedMoney = project ? projectMargins([project.id], sales, payments, expenses)[0]?.economics : undefined;
  // A quoted sale or an unpaid link produces a row of zeros — nothing to report yet.
  const economics = linkedMoney && (linkedMoney.revenue > 0 || linkedMoney.spent > 0) ? linkedMoney : undefined;

  async function handleSave() {
    if (!canSave || submitting) return;
    setSubmitting(true);
    const patch = {
      title: title.trim(),
      medium: medium.trim(),
      status,
      startDate: startDate || null,
      dueDate: dueDate || null,
      price: price ? Number(price) : null,
      availability,
      cost: cost ? Number(cost) : null,
      dimensions: dimensions.trim(),
      year: year && Number.isInteger(Number(year)) ? Number(year) : null,
      edition: edition.trim(),
      location: location.trim(),
      contactId: contactId || null,
      courseId: courseId || null,
      notes: notes.trim()
    };
    const id = project ? project.id : makeId();
    const ok = project
      ? await updateProject(project.id, patch)
      : await addProject({ id, createdAt: todayISO(), ...patch });
    if (!ok) {
      // The store reverted and reported why; keep her input on screen.
      setSubmitting(false);
      return;
    }
    haptic.success();
    showSuccess(project ? "Pieza actualizada" : "Pieza creada");
    if (!project && onCreated) onCreated(id);
    else onClose();
  }

  async function handleDelete() {
    if (!project || submitting) return;
    setSubmitting(true);
    if (!(await removeProject(project.id))) {
      // The store reverted and reported why; nothing was removed.
      setSubmitting(false);
      return;
    }
    haptic.warn();
    showSuccess("Pieza eliminada");
    onClose();
  }

  return (
    <Sheet
      title={project ? "Editar pieza" : "Nueva pieza"}
      onClose={safeClose}
      dirty={dirty}
      discardText={
        project
          ? "¿Descartar los cambios? La pieza se queda como estaba."
          : "¿Descartar? Esta pieza no se guarda."
      }
      footer={
        <SheetActions
          canSave={canSave}
          submitting={submitting}
          onSave={() => void handleSave()}
          onDelete={project ? () => void handleDelete() : undefined}
          confirmText="¿Eliminar esta pieza? Sus ingresos y gastos quedan sin pieza ligada."
        />
      }
    >
      {economics && (
        <div className="money-panel money-panel--compact">
          <div className="money-stats" style={{ marginBottom: 0 }}>
            <div>
              <div className="money-stat-label">Vendido</div>
              <div className="money-stat-value">{formatMXNShort(economics.revenue)}</div>
            </div>
            <div>
              <div className="money-stat-label">Invertido</div>
              <div className="money-stat-value">{formatMXNShort(economics.spent)}</div>
            </div>
            <div>
              <div className="money-stat-label">Margen</div>
              <div
                className={`money-stat-value ${
                  economics.margin < 0
                    ? "money-margin-neg"
                    : economics.margin > 0
                      ? "money-margin-pos"
                      : ""
                }`}
              >
                {formatMXNShortSigned(economics.margin)}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="input-group">
        <label className="input-label" htmlFor="project-title">Título</label>
        <input
          id="project-title"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Retrato, serie, encargo…"
          autoFocus={project === null && prefersAutoFocus()}
        />
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="project-medium">Técnica / medio</label>
        <input id="project-medium" className="input" value={medium} onChange={(e) => setMedium(e.target.value)} placeholder="Óleo, acrílico, grabado…" list="project-medium-list" />
        <datalist id="project-medium-list">
          {[...new Set([...settings.mediums, ...suggestMediums(projects), ...MEDIUM_SUGGESTIONS])].map((m) => (
            <option value={m} key={m} />
          ))}
        </datalist>
        {mediumChips.length > 0 && (
          <div className="chip-row" style={{ marginTop: 8 }}>
            {mediumChips.map((m) => (
              <button type="button" key={m} className={`chip ${medium === m ? "active" : ""}`} onClick={() => setMedium(m)}>
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="input-group">
        <span className="input-label">Estado</span>
        <SegmentedControl
          items={STATUS_ITEMS}
          value={status}
          onChange={(k) => setStatus(k as ProjectStatus)}
          size="sm"
          role="radiogroup"
          ariaLabel="Estado"
        />
      </div>

      <div className="form-row">
        <div className="input-group">
          <label className="input-label" htmlFor="project-start">Inicio</label>
          <input id="project-start" className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="project-due">Entrega</label>
          <input id="project-due" className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="project-price">Precio (MXN)</label>
        <div className="money-input-wrap">
          <span className="money-input-symbol">$</span>
          <input id="project-price" className="input money-input" type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
        </div>
      </div>

      <div className="input-group">
        <span className="input-label">Disponibilidad</span>
        <ChipSelect options={AVAILABILITY} value={availability} onChange={setAvailability} ariaLabel="Disponibilidad" />
      </div>

      {showSheet ? (
        <>
          <div className="form-row">
            <div className="input-group">
              <label className="input-label" htmlFor="project-dimensions">Medidas</label>
              <input id="project-dimensions" className="input" value={dimensions} onChange={(e) => setDimensions(e.target.value)} placeholder="60 × 80 cm" />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="project-year">Año</label>
              <input id="project-year" className="input" type="number" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />
            </div>
          </div>
          <div className="form-row">
            <div className="input-group">
              <label className="input-label" htmlFor="project-edition">Edición</label>
              <input id="project-edition" className="input" value={edition} onChange={(e) => setEdition(e.target.value)} placeholder="Única, 3/10…" />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="project-cost">Costo estimado</label>
              <div className="money-input-wrap">
                <span className="money-input-symbol">$</span>
                <input id="project-cost" className="input money-input" type="number" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
              </div>
            </div>
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="project-location">Dónde está</label>
            <input id="project-location" className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Taller, galería X, casa de…" />
          </div>
        </>
      ) : (
        <div className="input-group">
          <button type="button" className="btn btn-ghost btn-mini" onClick={() => setShowSheet(true)}>
            <Icon name="plus" size={14} strokeWidth={2.4} /> Ficha de la pieza (medidas, año, edición, lugar)
          </button>
        </div>
      )}

      <div className="input-group">
        <span className="input-label" id={`${uid}-contact`}>Cliente / galería</span>
        <PickerField
          labelId={`${uid}-contact`}
          title="Cliente / galería"
          options={contactOptions}
          value={contactId}
          onChange={setContactId}
          onCreate={(name) =>
            // A sold or reserved piece has a client; anyone attached to an
            // available one is a prospect, which is ContactSheet's own default.
            quick.contact(name, availability === "sold" || availability === "reserved" ? "client" : "lead")
          }
          createLabel="Nuevo contacto"
        />
      </div>

      {(settings.practice.includes("studies") || courses.length > 0) && (
        <div className="input-group">
          <span className="input-label" id={`${uid}-course`}>Para el curso</span>
          <PickerField
            labelId={`${uid}-course`}
            title="Curso"
            options={courseOptions}
            value={courseId}
            onChange={setCourseId}
            onCreate={(name) => quick.course(name)}
            createLabel="Nuevo curso"
          />
        </div>
      )}

      {project && (
        <div className="input-group">
          <div className="section-header" style={{ padding: "0 0 8px" }}>
            <span className="input-label" style={{ marginBottom: 0 }}>Fotos y archivos</span>
            <button type="button" className="see-all btn-tap" onClick={() => setUploadOpen(true)}><Icon name="plus" size={14} strokeWidth={2.4} /> Agregar</button>
          </div>
          <div className="money-list">
            <DocumentList documents={photos} onOpen={(d) => (d.kind === "link" && d.url ? window.open(d.url, "_blank", "noopener") : setDocOpen(d))} emptyBody="Fotos del proceso, de la pieza terminada, o el PDF de la ficha." />
          </div>
        </div>
      )}

      <div className="input-group">
        <label className="input-label" htmlFor="project-notes">Notas</label>
        <textarea id="project-notes" className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {uploadOpen && project && <UploadSheet links={{ projectId: project.id, courseId: project.courseId }} onClose={() => setUploadOpen(false)} />}
      {docOpen && <DocumentViewer doc={docOpen} onClose={() => setDocOpen(null)} onDelete={removeDocument} />}
    </Sheet>
  );
}
