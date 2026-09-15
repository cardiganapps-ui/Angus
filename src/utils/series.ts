import type { EventSeries, ScheduleEvent } from "../types";
import { addDays, addMonths, parseISODate, weekRange } from "./dates";

/* ── Event series expansion ──
   Which dates a series lands on, and which of those still need a row.
   Weekly / biweekly series can hit several weekdays; each weekday is
   its own weekly (or fortnightly) train anchored on the first such day
   at or after startDate. Monthly series step from startDate with
   month-end clamping (addMonths). Pure. */

export const SERIES_HORIZON_DAYS = 84; // ~12 weeks ahead

type Shape = Pick<EventSeries, "cadence" | "weekdays" | "startDate" | "endDate">;

/** Every date the series falls on with from <= date <= to, ascending. */
export function seriesDates(series: Shape, from: string, to: string): string[] {
  if (to < from) return [];
  const last = series.endDate && series.endDate < to ? series.endDate : to;
  const out = new Set<string>();

  if (series.cadence === "monthly") {
    for (let n = 0; n < 1200; n++) {
      const d = addMonths(series.startDate, n);
      if (d > last) break;
      if (d >= from) out.add(d);
    }
  } else {
    const step = series.cadence === "weekly" ? 7 : 14;
    const startDow = parseISODate(series.startDate).getDay();
    const days = series.weekdays.length ? [...new Set(series.weekdays)] : [startDow];
    // Every weekday train anchors to the START WEEK, so a biweekly
    // "lun y mié" meets both days in the same fortnight; a day that
    // falls before startDate in that week begins one step later.
    const weekStart = weekRange(series.startDate, 1).from;
    for (const dow of days) {
      let d = addDays(weekStart, (dow + 6) % 7);
      if (d < series.startDate) d = addDays(d, step);
      for (let n = 0; n < 2000 && d <= last; n++) {
        if (d >= from) out.add(d);
        d = addDays(d, step);
      }
    }
  }
  return [...out].sort();
}

/** Occurrences that should exist between from..to but have no row yet. */
export function missingOccurrences(
  series: EventSeries,
  events: ScheduleEvent[],
  from: string,
  to: string
): Omit<ScheduleEvent, "id" | "createdAt">[] {
  const have = new Set(events.filter((e) => e.seriesId === series.id).map((e) => e.date));
  return seriesDates(series, from, to)
    .filter((date) => !have.has(date))
    .map((date) => ({
      title: series.title,
      kind: series.kind,
      date,
      startTime: series.startTime,
      endTime: series.endTime,
      location: series.location,
      projectId: series.projectId,
      contactId: series.contactId,
      budget: null,
      courseId: series.courseId,
      missed: false,
      seriesId: series.id,
      cancelled: false,
      detached: false,
      notes: series.notes
    }));
}

/** Everything every series is missing up to the horizon, in one list. */
export function pendingOccurrences(
  seriesList: EventSeries[],
  events: ScheduleEvent[],
  today: string,
  horizonDays = SERIES_HORIZON_DAYS
): Omit<ScheduleEvent, "id" | "createdAt">[] {
  const to = addDays(today, horizonDays);
  return seriesList.flatMap((s) => missingOccurrences(s, events, s.startDate > today ? s.startDate : today, to));
}

/** Future, non-detached occurrences of a series (what "toda la serie" rewrites). */
export function seriesFuture(series: EventSeries, events: ScheduleEvent[], fromDate: string): ScheduleEvent[] {
  return events.filter((e) => e.seriesId === series.id && e.date >= fromDate && !e.detached);
}

/* Applying a new shape to a series' future rows: rows whose date still
   belongs to the pattern get the row patch; rows that no longer do
   (she moved the class from Tuesday to Monday) are dropped, and the
   generator fills the new dates. Detached rows are hers and untouched. */
export function reshapeFuture(
  series: EventSeries,
  next: Partial<EventSeries>,
  events: ScheduleEvent[],
  fromDate: string
): { keep: ScheduleEvent[]; drop: ScheduleEvent[]; patch: Partial<ScheduleEvent> } {
  const shaped = { ...series, ...next };
  const future = seriesFuture(series, events, fromDate);
  const last = future.reduce((m, e) => (e.date > m ? e.date : m), fromDate);
  const valid = new Set(seriesDates(shaped, fromDate, last));
  return {
    keep: future.filter((e) => valid.has(e.date)),
    drop: future.filter((e) => !valid.has(e.date)),
    patch: seriesToEventPatch(shaped)
  };
}

/** The patch that turns a series edit into an event patch (fields a row copies). */
export function seriesToEventPatch(series: EventSeries): Partial<ScheduleEvent> {
  return {
    title: series.title,
    kind: series.kind,
    startTime: series.startTime,
    endTime: series.endTime,
    location: series.location,
    projectId: series.projectId,
    contactId: series.contactId,
    courseId: series.courseId,
    notes: series.notes
  };
}

const WEEKDAY_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** "Cada martes y jueves", "Cada 2 semanas los lunes", "Cada mes el 15". */
export function describeSeries(series: Shape): string {
  if (series.cadence === "monthly") {
    return `Cada mes el ${parseISODate(series.startDate).getDate()}`;
  }
  const dow = series.weekdays.length ? [...new Set(series.weekdays)].sort() : [parseISODate(series.startDate).getDay()];
  const names = dow.map((d) => WEEKDAY_SHORT[d]);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
  return series.cadence === "weekly" ? `Cada ${list}` : `Cada 2 semanas: ${list}`;
}
