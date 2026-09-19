const MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic"
];

const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const WEEKDAYS_LONG = [
  "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"
];

const MONTHS_LONG = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export function todayISO(): string {
  return toISODate(new Date());
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatShort(iso: string): string {
  const d = parseISODate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function formatWithWeekday(iso: string): string {
  const d = parseISODate(iso);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** First and last day of the calendar month `iso` falls in, both inclusive. */
export function monthRange(iso: string): { from: string; to: string } {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

/** "Septiembre 2026". Accepts a full ISO date or a "YYYY-MM" month key. */
export function formatMonthLong(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

/** "Martes 15 de septiembre" — the dashboard header date. */
export function formatDateLong(iso: string): string {
  const d = parseISODate(iso);
  return `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} de ${MONTHS_LONG[d.getMonth()].toLowerCase()}`;
}

/** The month alone, lowercase — for inline phrases ("más que agosto"). */
export function monthName(iso: string): string {
  const [, m] = iso.split("-").map(Number);
  return MONTHS_LONG[m - 1].toLowerCase();
}

/** First letter of the month. */
export function monthInitial(iso: string): string {
  const [, m] = iso.split("-").map(Number);
  return MONTHS_LONG[m - 1].slice(0, 1);
}

/** "sep" — the trend chart's axis: one letter made abr/ago and jun/jul twins. */
export function monthShort(iso: string): string {
  const [, m] = iso.split("-").map(Number);
  return MONTHS[m - 1];
}

/* Greeting by wall-clock hour. Takes a Date so it's testable without
   mocking the clock, and so a screen can pass the same `now` it used
   for everything else. */
export function greetingFor(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

/* How far away something is, in words she'd actually use. Standalone
   and capitalized ("Hoy", "En 3 días"); a caller that needs it mid-
   sentence lowercases it ("Vencida hace 14 días"). */
export function relativeDayLabel(days: number): string {
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  if (days === -1) return "Ayer";
  return days > 0 ? `En ${days} días` : `Hace ${-days} días`;
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Same day-of-month N months later, clamped to that month's last day. */
export function addMonths(iso: string, months: number): string {
  const [y, m, day] = iso.split("-").map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, last));
  return toISODate(target);
}

/** Signed whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 86_400_000);
}

/** Month key "YYYY-MM" shifted by N months (negative goes back). */
export function shiftMonth(iso: string, months: number): string {
  return addMonths(`${iso.slice(0, 7)}-01`, months);
}

/** Jan 1 – Dec 31 of the year `iso` falls in. */
export function yearRange(iso: string): { from: string; to: string } {
  const y = iso.slice(0, 4);
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

/** The calendar quarter `iso` falls in, inclusive. */
export function quarterRange(iso: string): { from: string; to: string } {
  const [y, m] = iso.split("-").map(Number);
  const q = Math.floor((m - 1) / 3);
  const first = q * 3 + 1;
  const from = `${y}-${String(first).padStart(2, "0")}-01`;
  return { from, to: monthRange(`${y}-${String(first + 2).padStart(2, "0")}-01`).to };
}

/** The N months ending with the month `iso` falls in, inclusive. */
export function trailingMonthsRange(iso: string, count: number): { from: string; to: string } {
  return { from: monthRange(shiftMonth(iso, -(count - 1))).from, to: monthRange(iso).to };
}

/** Monday–Sunday (or Sunday–Saturday) week containing `iso`. */
export function weekRange(iso: string, weekStartsOn: 0 | 1 = 1): { from: string; to: string } {
  const d = parseISODate(iso);
  const back = (d.getDay() - weekStartsOn + 7) % 7;
  const from = addDays(iso, -back);
  return { from, to: addDays(from, 6) };
}

/** "2026" for a year range, "Septiembre 2026" for a month, "Jul – Sep 2026" otherwise. */
export function formatRange(from: string, to: string): string {
  if (from.slice(5) === "01-01" && to.slice(5) === "12-31" && from.slice(0, 4) === to.slice(0, 4)) {
    return from.slice(0, 4);
  }
  if (from.slice(0, 7) === to.slice(0, 7)) return formatMonthLong(from);
  const a = parseISODate(from);
  const b = parseISODate(to);
  const ma = MONTHS[a.getMonth()];
  const mb = MONTHS[b.getMonth()];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return a.getFullYear() === b.getFullYear()
    ? `${cap(ma)} – ${cap(mb)} ${b.getFullYear()}`
    : `${cap(ma)} ${a.getFullYear()} – ${cap(mb)} ${b.getFullYear()}`;
}
