const MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic"
];

const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

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

export function isPast(iso: string): boolean {
  return iso < todayISO();
}

export function isToday(iso: string): boolean {
  return iso === todayISO();
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

export function daysUntil(iso: string): number {
  const today = parseISODate(todayISO());
  const target = parseISODate(iso);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
