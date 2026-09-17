import { useId, useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { Course, CourseKind, CourseModality, CoursePaymentPlan, CourseStatus, EventSeries } from "../types";
import { COURSE_KIND, COURSE_MODALITY, COURSE_PAYMENT_PLAN, COURSE_STATUS } from "../data/constants";
import { Sheet } from "./Sheet";
import { SheetActions } from "./SheetActions";
import { ChipSelect } from "./ChipSelect";
import { SegmentedControl } from "./SegmentedControl";
import { PickerField } from "./PickerField";
import { ContactSheet } from "./ContactSheet";
import { ScheduleFields, type ScheduleValue } from "./ScheduleFields";
import { domId, makeId } from "../utils/id";
import { useDirtyGuard } from "../hooks/useDirtyGuard";
import { parseISODate, todayISO } from "../utils/dates";
import { reshapeFuture } from "../utils/series";
import { haptic } from "../lib/haptics";
import { prefersAutoFocus } from "../lib/device";

/* ── CourseSheet ──
   Create / edit a course she takes. The schedule is an EventSeries the
   course owns (weekday chips + times); the cost, when monthly, is an
   expense rule so each month's tuition lands in Dinero on its own.
   One-off and per-session costs are recorded from the course's Gastos
   tab when she actually pays — Angus never assumes money moved. */

const STATUS_ITEMS = COURSE_STATUS.map((s) => ({ k: s.value, l: s.label }));
const MODALITY_ITEMS = COURSE_MODALITY.map((m) => ({ k: m.value, l: m.label }));
const PLAN_ITEMS = COURSE_PAYMENT_PLAN.map((p) => ({ k: p.value, l: p.label }));

export function CourseSheet({
  course,
  onClose,
  onDeleted
}: {
  course: Course | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const {
    addCourse,
    updateCourse,
    removeCourse,
    addSeries,
    updateSeries,
    updateEvent,
    removeEvents,
    addRule,
    updateRule,
    events,
    series: allSeries,
    rules,
    contacts
  } = useApp();
  const { showSuccess } = useToast();
  const parent: EventSeries | null = course?.seriesId ? (allSeries.find((s) => s.id === course.seriesId) ?? null) : null;
  const rule = course?.recurringRuleId ? (rules.find((r) => r.id === course.recurringRuleId) ?? null) : null;
  const today = todayISO();

  const [name, setName] = useState(course?.name ?? "");
  const [kind, setKind] = useState<CourseKind>(course?.kind ?? "class");
  const [status, setStatus] = useState<CourseStatus>(course?.status ?? "active");
  const [institution, setInstitution] = useState(course?.institution ?? "");
  const [teacherId, setTeacherId] = useState(course?.teacherContactId ?? "");
  const [newTeacher, setNewTeacher] = useState(false);
  const [modality, setModality] = useState<CourseModality>(course?.modality ?? "in_person");
  const [location, setLocation] = useState(course?.location ?? parent?.location ?? "");
  const [url, setUrl] = useState(course?.url ?? "");
  const [startDate, setStartDate] = useState(course?.startDate ?? parent?.startDate ?? today);
  const [endDate, setEndDate] = useState(course?.endDate ?? parent?.endDate ?? "");
  const [hasSchedule, setHasSchedule] = useState<boolean>(course ? parent !== null : true);
  const [schedule, setSchedule] = useState<ScheduleValue>({
    weekdays: parent?.weekdays ?? [],
    cadence: parent?.cadence === "biweekly" ? "biweekly" : "weekly",
    startTime: parent?.startTime ?? "17:00",
    endTime: parent?.endTime ?? "19:00"
  });
  const [cost, setCost] = useState(course?.cost?.toString() ?? "");
  const [plan, setPlan] = useState<CoursePaymentPlan>(course?.paymentPlan ?? "single");
  const [notes, setNotes] = useState(course?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const uid = domId(useId());
  const dirty = useDirtyGuard({
    name, kind, status, institution, teacherId, modality, location, url,
    startDate, endDate, hasSchedule, cost, plan, notes,
    scheduleWeekdays: schedule.weekdays,
    scheduleCadence: schedule.cadence,
    scheduleStart: schedule.startTime,
    scheduleEnd: schedule.endTime
  });

  const safeClose = submitting ? null : onClose;
  const canSave = name.trim().length > 0 && (!endDate || !startDate || endDate >= startDate);
  const costNum = plan === "free" ? null : cost ? Number(cost) : null;
  const teacherOptions = [...contacts].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name }));

  const seriesShape = (courseId: string): Omit<EventSeries, "id" | "createdAt"> => ({
    title: name.trim(),
    kind: "class",
    cadence: schedule.cadence,
    weekdays: schedule.weekdays.length ? schedule.weekdays : [parseISODate(startDate || today).getDay()],
    startTime: schedule.startTime || null,
    endTime: schedule.endTime || null,
    location: location.trim(),
    startDate: startDate || today,
    endDate: endDate || null,
    projectId: null,
    contactId: teacherId || null,
    groupId: null,
    courseId,
    notes: ""
  });
  const ruleShape = (courseId: string) => ({
    kind: "expense" as const,
    title: `Colegiatura · ${name.trim()}`,
    amount: costNum ?? 0,
    category: "courses",
    cadence: "monthly" as const,
    interval: 1,
    startDate: startDate || today,
    endDate: endDate || null,
    contactId: null,
    projectId: null,
    groupId: null,
    courseId,
    active: true,
    notes: ""
  });

  async function handleSave() {
    if (!canSave) return;
    setSubmitting(true);
    const id = course?.id ?? makeId();
    const patch = {
      name: name.trim(),
      kind,
      status,
      institution: institution.trim(),
      teacherContactId: teacherId || null,
      modality,
      location: location.trim(),
      url: url.trim(),
      startDate: startDate || null,
      endDate: endDate || null,
      cost: costNum,
      paymentPlan: plan,
      notes: notes.trim()
    };
    const wantsRule = plan === "monthly" && costNum !== null && costNum > 0;
    const wantsSeries = hasSchedule && schedule.weekdays.length > 0;

    if (course) {
      void updateCourse(course.id, patch);
      // Schedule: reshape, create, or retire.
      if (parent && wantsSeries) {
        const shape = seriesShape(course.id);
        void updateSeries(parent.id, shape);
        const { keep, drop, patch: rowPatch } = reshapeFuture(parent, shape, events, today);
        for (const occ of keep) void updateEvent(occ.id, rowPatch);
        if (drop.length) void removeEvents(drop.map((e) => e.id));
      } else if (parent && !wantsSeries) {
        // Stop scheduling without touching the past: the series ends
        // today, only future occurrences go, and attended sessions (with
        // their "Falté" flags and apuntes) stay on the course.
        void updateSeries(parent.id, { endDate: today });
        const future = events.filter((e) => e.seriesId === parent.id && e.date > today);
        if (future.length) void removeEvents(future.map((e) => e.id));
        void updateCourse(course.id, { seriesId: null });
      } else if (!parent && wantsSeries) {
        const seriesId = makeId();
        void addSeries({ id: seriesId, createdAt: today, ...seriesShape(course.id) }).then((ok) => {
          if (ok) void updateCourse(course.id, { seriesId });
        });
      }
      // Tuition rule: keep it honest with the plan (future periods only).
      if (rule && wantsRule) {
        void updateRule(rule.id, { amount: costNum as number, title: ruleShape(course.id).title, active: true, endDate: endDate || null });
      } else if (rule && !wantsRule && rule.active) {
        void updateRule(rule.id, { active: false, endDate: today });
      } else if (!rule && wantsRule) {
        const ruleId = makeId();
        void addRule({ id: ruleId, createdAt: today, ...ruleShape(course.id) }).then((ok) => {
          if (ok) void updateCourse(course.id, { recurringRuleId: ruleId });
        });
      }
      showSuccess("Curso actualizado");
    } else {
      void addCourse({ id, createdAt: today, seriesId: null, recurringRuleId: null, ...patch }).then(async (ok) => {
        if (!ok) return;
        if (wantsSeries) {
          const seriesId = makeId();
          const ok2 = await addSeries({ id: seriesId, createdAt: today, ...seriesShape(id) });
          if (ok2) void updateCourse(id, { seriesId });
        }
        if (wantsRule) {
          const ruleId = makeId();
          const ok3 = await addRule({ id: ruleId, createdAt: today, ...ruleShape(id) });
          if (ok3) void updateCourse(id, { recurringRuleId: ruleId });
        }
      });
      showSuccess(wantsSeries ? "Curso creado · sesiones agendadas" : "Curso creado");
    }
    haptic.success();
    onClose();
  }

  function handleDelete() {
    if (!course) return;
    void removeCourse(course.id);
    haptic.warn();
    showSuccess("Curso eliminado");
    (onDeleted ?? onClose)();
  }

  return (
    <>
      <Sheet
        title={course ? "Editar curso" : "Nuevo curso"}
        onClose={safeClose}
        dirty={dirty}
        discardText={
          course
            ? "¿Descartar los cambios? El curso se queda como estaba."
            : "¿Descartar? Este curso y su horario no se guardan."
        }
        footer={
          <SheetActions
            canSave={canSave}
            submitting={submitting}
            onSave={() => void handleSave()}
            onDelete={course ? handleDelete : undefined}
            confirmText="¿Eliminar este curso? Se quitan sus sesiones y su material; tus gastos, notas y piezas se conservan."
          />
        }
      >
        <div className="input-group">
          <label className="input-label" htmlFor="course-name">Nombre</label>
          <input
            id="course-name"
            className="input"
            value={name}
            placeholder="Maestría en Artes, Taller de grabado…"
            onChange={(e) => setName(e.target.value)}
            autoFocus={course === null && prefersAutoFocus()}
          />
        </div>

        <div className="input-group">
          <span className="input-label">Tipo</span>
          <ChipSelect options={COURSE_KIND} value={kind} onChange={setKind} ariaLabel="Tipo de curso" />
        </div>

        {course && (
          <div className="input-group">
            <span className="input-label">Estado</span>
            <SegmentedControl items={STATUS_ITEMS} value={status} onChange={(k) => setStatus(k as CourseStatus)} size="sm" role="radiogroup" ariaLabel="Estado" />
          </div>
        )}

        <div className="input-group">
          <label className="input-label" htmlFor="course-institution">Escuela o institución</label>
          <input id="course-institution" className="input" value={institution} placeholder="UNAM, La Esmeralda, taller independiente…" onChange={(e) => setInstitution(e.target.value)} />
        </div>

        <div className="input-group">
          <span className="input-label" id={`${uid}-teacher`}>Maestro/a</span>
          <PickerField
            labelId={`${uid}-teacher`}
            title="Maestro/a"
            options={[{ value: "__new__", label: "+ Nuevo contacto" }, ...teacherOptions]}
            value={teacherId}
            onChange={(v) => (v === "__new__" ? setNewTeacher(true) : setTeacherId(v))}
          />
        </div>

        <div className="input-group">
          <span className="input-label">Modalidad</span>
          <SegmentedControl items={MODALITY_ITEMS} value={modality} onChange={(k) => setModality(k as CourseModality)} size="sm" role="radiogroup" ariaLabel="Modalidad" />
        </div>

        {modality !== "online" && (
          <div className="input-group">
            <label className="input-label" htmlFor="course-location">Lugar</label>
            <input id="course-location" className="input" value={location} placeholder="Salón, dirección…" onChange={(e) => setLocation(e.target.value)} />
          </div>
        )}
        {modality !== "in_person" && (
          <div className="input-group">
            <label className="input-label" htmlFor="course-url">Enlace (plataforma, aula virtual)</label>
            <input id="course-url" className="input" type="url" inputMode="url" value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} />
          </div>
        )}

        <div className="form-row">
          <div className="input-group">
            <label className="input-label" htmlFor="course-from">Empieza</label>
            <input id="course-from" className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="course-to">Termina</label>
            <input id="course-to" className="input" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="input-group">
          <span className="input-label">Horario</span>
          <SegmentedControl
            items={[
              { k: "yes", l: "Sesiones fijas" },
              { k: "no", l: "Sin horario fijo" }
            ]}
            value={hasSchedule ? "yes" : "no"}
            onChange={(k) => setHasSchedule(k === "yes")}
            size="sm"
            role="radiogroup"
            ariaLabel="Horario"
          />
          {!hasSchedule && <div className="input-help">Agrega cada sesión desde el curso cuando la sepas.</div>}
        </div>
        {hasSchedule && (
          <ScheduleFields
            value={schedule}
            onChange={setSchedule}
            idPrefix="course"
            startDate={startDate || today}
            help="Angus agenda las sesiones en tu Agenda y sigue agregando."
          />
        )}

        <div className="input-group">
          <span className="input-label">Cómo lo pagas</span>
          <SegmentedControl items={PLAN_ITEMS} value={plan} onChange={(k) => setPlan(k as CoursePaymentPlan)} size="sm" role="radiogroup" ariaLabel="Forma de pago" />
        </div>
        {plan !== "free" && (
          <div className="input-group">
            <label className="input-label" htmlFor="course-cost">
              {plan === "monthly" ? "Colegiatura mensual (MXN)" : plan === "per_session" ? "Costo por sesión (MXN)" : "Costo total (MXN)"}
            </label>
            <div className="money-input-wrap">
              <span className="money-input-symbol">$</span>
              <input id="course-cost" className="input money-input" type="number" inputMode="decimal" value={cost} placeholder="0" onChange={(e) => setCost(e.target.value)} />
            </div>
            <div className="input-help">
              {plan === "monthly"
                ? "Angus registra el gasto cada mes hasta que termine el curso."
                : "Registra cada pago desde el curso cuando lo hagas; nada se apunta solo."}
            </div>
          </div>
        )}

        <div className="input-group">
          <label className="input-label" htmlFor="course-notes">Notas</label>
          <textarea id="course-notes" className="input" rows={2} value={notes} placeholder="Programa, requisitos, lo que quieres sacar de esto…" onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Sheet>

      {newTeacher && (
        <ContactSheet
          contact={null}
          onClose={() => setNewTeacher(false)}
          onCreated={(id) => {
            setNewTeacher(false);
            setTeacherId(id);
          }}
        />
      )}
    </>
  );
}
