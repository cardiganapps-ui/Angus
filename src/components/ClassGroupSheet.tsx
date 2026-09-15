import { useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { ClassGroup, EventSeries, SeriesCadence, TuitionCadence } from "../types";
import { TUITION_CADENCE } from "../data/constants";
import { Sheet } from "./Sheet";
import { SheetActions } from "./SheetActions";
import { SegmentedControl } from "./SegmentedControl";
import { makeId } from "../utils/id";
import { parseISODate, todayISO } from "../utils/dates";
import { describeSeries, seriesFuture, seriesToEventPatch } from "../utils/series";
import { haptic } from "../lib/haptics";

/* ── ClassGroupSheet ──
   Create / edit a class group. The schedule is an EventSeries owned by
   the group (weekday chips + times); saving creates or updates it and
   the occurrences follow (AppContext). Tuition per student and the
   cadence feed the enrollment's recurring rule. */

const WEEKDAYS = [
  { v: 1, l: "L", name: "lunes" },
  { v: 2, l: "M", name: "martes" },
  { v: 3, l: "M", name: "miércoles" },
  { v: 4, l: "J", name: "jueves" },
  { v: 5, l: "V", name: "viernes" },
  { v: 6, l: "S", name: "sábado" },
  { v: 0, l: "D", name: "domingo" }
];
const CADENCE_ITEMS: { k: SeriesCadence; l: string }[] = [
  { k: "weekly", l: "Semanal" },
  { k: "biweekly", l: "Quincenal" }
];
const TUITION_ITEMS = TUITION_CADENCE.map((t) => ({ k: t.value, l: t.label }));

export function ClassGroupSheet({
  group,
  onClose,
  onDeleted
}: {
  group: ClassGroup | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const { addGroup, updateGroup, removeGroup, addSeries, updateSeries, updateEvent, events, series: allSeries, rules, updateRule } =
    useApp();
  const { showSuccess } = useToast();
  const parent: EventSeries | null = group?.seriesId ? (allSeries.find((s) => s.id === group.seriesId) ?? null) : null;

  const [name, setName] = useState(group?.name ?? "");
  const [weekdays, setWeekdays] = useState<number[]>(parent?.weekdays ?? []);
  const [cadence, setCadence] = useState<SeriesCadence>(parent?.cadence === "biweekly" ? "biweekly" : "weekly");
  const [startTime, setStartTime] = useState(parent?.startTime ?? "17:00");
  const [endTime, setEndTime] = useState(parent?.endTime ?? "19:00");
  const [startDate, setStartDate] = useState(parent?.startDate ?? todayISO());
  const [location, setLocation] = useState(group?.location ?? parent?.location ?? "");
  const [tuition, setTuition] = useState(group?.tuitionAmount?.toString() ?? "");
  const [tuitionCadence, setTuitionCadence] = useState<TuitionCadence>(group?.tuitionCadence ?? "monthly");
  const [capacity, setCapacity] = useState(group?.capacity?.toString() ?? "");
  const [notes, setNotes] = useState(group?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const safeClose = submitting ? null : onClose;
  const canSave = name.trim().length > 0 && startDate.length > 0;

  const toggleWeekday = (v: number) => {
    haptic.tap();
    setWeekdays((list) => (list.includes(v) ? list.filter((d) => d !== v) : [...list, v]));
  };

  async function handleSave() {
    if (!canSave) return;
    setSubmitting(true);
    const id = group?.id ?? makeId();
    const seriesShape = {
      title: name.trim(),
      kind: "class" as const,
      cadence,
      weekdays: weekdays.length ? weekdays : [parseISODate(startDate).getDay()],
      startTime: startTime || null,
      endTime: endTime || null,
      location: location.trim(),
      startDate,
      endDate: null,
      projectId: null,
      contactId: null,
      groupId: id,
      notes: ""
    };
    const groupPatch = {
      name: name.trim(),
      tuitionAmount: tuition ? Number(tuition) : null,
      tuitionCadence,
      capacity: capacity && Number(capacity) > 0 ? Math.round(Number(capacity)) : null,
      location: location.trim(),
      notes: notes.trim()
    };

    if (group) {
      void updateGroup(group.id, groupPatch);
      if (parent) {
        void updateSeries(parent.id, seriesShape);
        const patch = seriesToEventPatch({ ...parent, ...seriesShape });
        for (const occ of seriesFuture(parent, events, todayISO())) void updateEvent(occ.id, patch);
      } else {
        const seriesId = makeId();
        void addSeries({ id: seriesId, createdAt: todayISO(), ...seriesShape }).then((ok) => {
          if (ok) void updateGroup(group.id, { seriesId });
        });
      }
      // Tuition change reaches every student's rule (future periods only).
      const newAmount = groupPatch.tuitionAmount;
      if (newAmount !== null && newAmount !== group.tuitionAmount) {
        for (const r of rules) if (r.groupId === group.id && r.active) void updateRule(r.id, { amount: newAmount });
      }
      showSuccess("Clase actualizada");
    } else {
      const seriesId = makeId();
      // Group first (without its schedule), then the series pointing back
      // at it, then the link — each side references the other, so
      // neither can be inserted with the other's id up front.
      void addGroup({ id, createdAt: todayISO(), seriesId: null, active: true, ...groupPatch }).then((ok) => {
        if (!ok) return;
        void addSeries({ id: seriesId, createdAt: todayISO(), ...seriesShape }).then((ok2) => {
          if (ok2) void updateGroup(id, { seriesId });
        });
      });
      showSuccess("Clase creada · sesiones agendadas");
    }
    haptic.success();
    onClose();
  }

  function handleDelete() {
    if (!group) return;
    void removeGroup(group.id);
    haptic.warn();
    showSuccess("Clase eliminada");
    (onDeleted ?? onClose)();
  }

  const preview = describeSeries({
    cadence,
    weekdays,
    startDate: startDate || todayISO(),
    endDate: null
  });

  return (
    <Sheet
      title={group ? "Editar clase" : "Nueva clase"}
      onClose={safeClose}
      footer={
        <SheetActions
          canSave={canSave}
          submitting={submitting}
          onSave={() => void handleSave()}
          onDelete={group ? handleDelete : undefined}
          confirmText="¿Eliminar esta clase? Se quitan las inscripciones; las sesiones y cobros ya registrados se conservan."
        />
      }
    >
      <div className="input-group">
        <label className="input-label" htmlFor="group-name">Nombre</label>
        <input
          id="group-name"
          className="input"
          value={name}
          placeholder="Óleo martes, Taller de grabado…"
          onChange={(e) => setName(e.target.value)}
          autoFocus={group === null}
        />
      </div>

      <div className="input-group">
        <span className="input-label">Días</span>
        <div className="weekday-row" role="group" aria-label="Días de la semana">
          {WEEKDAYS.map((d) => (
            <button
              type="button"
              key={d.v}
              className="weekday-chip"
              aria-pressed={weekdays.includes(d.v)}
              aria-label={d.name}
              onClick={() => toggleWeekday(d.v)}
            >
              {d.l}
            </button>
          ))}
        </div>
        <SegmentedControl
          items={CADENCE_ITEMS}
          value={cadence}
          onChange={(k) => setCadence(k as SeriesCadence)}
          size="sm"
          role="radiogroup"
          ariaLabel="Frecuencia"
          style={{ marginTop: 10 }}
        />
        <div className="input-help">{preview}. Angus agenda las sesiones y sigue agregando.</div>
      </div>

      <div className="form-row">
        <div className="input-group">
          <label className="input-label" htmlFor="group-start">Hora inicio</label>
          <input id="group-start" className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="group-end">Hora fin</label>
          <input id="group-end" className="input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
      </div>

      <div className="form-row">
        <div className="input-group">
          <label className="input-label" htmlFor="group-from">Desde</label>
          <input id="group-from" className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="group-capacity">Cupo</label>
          <input id="group-capacity" className="input" type="number" inputMode="numeric" min={1} value={capacity} placeholder="—" onChange={(e) => setCapacity(e.target.value)} />
        </div>
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="group-location">Lugar</label>
        <input id="group-location" className="input" value={location} placeholder="Taller, en línea…" onChange={(e) => setLocation(e.target.value)} />
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="group-tuition">Colegiatura por alumno (MXN)</label>
        <div className="money-input-wrap">
          <span className="money-input-symbol">$</span>
          <input id="group-tuition" className="input money-input" type="number" inputMode="decimal" value={tuition} placeholder="0" onChange={(e) => setTuition(e.target.value)} />
        </div>
        <SegmentedControl
          items={TUITION_ITEMS}
          value={tuitionCadence}
          onChange={(k) => setTuitionCadence(k as TuitionCadence)}
          size="sm"
          role="radiogroup"
          ariaLabel="Cómo se cobra"
          style={{ marginTop: 10 }}
        />
        <div className="input-help">
          {tuitionCadence === "monthly"
            ? "Al inscribir a alguien, Angus crea su cobro mensual y lo pone en Por cobrar cada mes."
            : "Al pasar lista, cada asistencia genera un cobro por sesión."}
        </div>
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="group-notes">Notas</label>
        <textarea id="group-notes" className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Sheet>
  );
}
