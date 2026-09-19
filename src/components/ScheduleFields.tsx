import type { SeriesCadence } from "../types";
import { SegmentedControl } from "./SegmentedControl";
import { describeSeries } from "../utils/series";
import { todayISO } from "../utils/dates";
import { haptic } from "../lib/haptics";

/* ── ScheduleFields ──
   The weekly-schedule block shared by anything that owns an EventSeries
   (a class she teaches, a course she takes): weekday chips, cadence,
   start/end times, and optionally the date range. The parent owns the
   state; this only renders and reports changes. */

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

export interface ScheduleValue {
  weekdays: number[];
  cadence: SeriesCadence;
  startTime: string;
  endTime: string;
}

export function ScheduleFields({
  value,
  onChange,
  idPrefix,
  startDate,
  help
}: {
  value: ScheduleValue;
  onChange: (next: ScheduleValue) => void;
  idPrefix: string;
  /** Used only for the preview sentence ("Cada mar y jue"). */
  startDate: string;
  help?: string;
}) {
  const toggleWeekday = (v: number) => {
    haptic.tap();
    const list = value.weekdays.includes(v) ? value.weekdays.filter((d) => d !== v) : [...value.weekdays, v];
    onChange({ ...value, weekdays: list });
  };
  const preview = describeSeries({
    cadence: value.cadence,
    weekdays: value.weekdays,
    startDate: startDate || todayISO(),
    endDate: null
  });

  return (
    <>
      <div className="input-group">
        <span className="input-label">Días</span>
        <div className="weekday-row" role="group" aria-label="Días de la semana">
          {WEEKDAYS.map((d) => (
            <button
              type="button"
              key={d.v}
              className="weekday-chip"
              aria-pressed={value.weekdays.includes(d.v)}
              aria-label={d.name}
              onClick={() => toggleWeekday(d.v)}
            >
              {d.l}
            </button>
          ))}
        </div>
        <SegmentedControl
          items={CADENCE_ITEMS}
          value={value.cadence}
          onChange={(k) => onChange({ ...value, cadence: k as SeriesCadence })}
          size="sm"
          role="radiogroup"
          ariaLabel="Frecuencia"
          style={{ marginTop: 10 }}
        />
        <div className="input-help">
          {value.weekdays.length ? `${preview}. ` : "Elige los días. "}
          {help ?? "Angus agenda las sesiones y sigue agregando."}
        </div>
      </div>

      <div className="form-row">
        <div className="input-group">
          <label className="input-label" htmlFor={`${idPrefix}-start`}>Hora inicio</label>
          <input
            id={`${idPrefix}-start`}
            className="input"
            type="time"
            value={value.startTime}
            onChange={(e) => onChange({ ...value, startTime: e.target.value })}
          />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor={`${idPrefix}-end`}>Hora fin</label>
          <input
            id={`${idPrefix}-end`}
            className="input"
            type="time"
            value={value.endTime}
            onChange={(e) => onChange({ ...value, endTime: e.target.value })}
          />
        </div>
      </div>
    </>
  );
}
