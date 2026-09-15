import { useMemo } from "react";
import type { ScheduleEvent } from "../types";
import { EVENT_KIND } from "../data/constants";
import { addDays, addMonths, formatMonthLong, monthRange, parseISODate, todayISO } from "../utils/dates";
import { Icon } from "./Icon";
import { haptic } from "../lib/haptics";

/* ── MonthGrid ──
   A month at a glance: 6 rows × 7 days (Monday first), a dot per
   event kind on each day (max 3, then a small dash), today ringed,
   the selected day filled. Days outside the month stay tappable so a
   swipe-less user can still reach the 1st of next month. */

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const MAX_DOTS = 3;

export function MonthGrid({
  month, // any ISO date inside the month
  selected,
  events,
  onSelect,
  onMonthChange
}: {
  month: string;
  selected: string;
  events: ScheduleEvent[];
  onSelect: (iso: string) => void;
  onMonthChange: (iso: string) => void;
}) {
  const today = todayISO();
  const { from, to } = monthRange(month);
  const colorOf = useMemo(() => new Map(EVENT_KIND.map((k) => [k.value, k.color])), []);

  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of events) {
      if (e.cancelled) continue;
      const list = map.get(e.date) ?? [];
      const color = colorOf.get(e.kind) ?? "var(--charcoal-xl)";
      if (!list.includes(color)) list.push(color);
      map.set(e.date, list);
    }
    return map;
  }, [events, colorOf]);

  // Monday-first grid start.
  const firstDow = (parseISODate(from).getDay() + 6) % 7;
  const gridStart = addDays(from, -firstDow);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <div className="cal">
      <div className="cal-head">
        <button
          type="button"
          className="period-nav-btn btn-tap"
          aria-label="Mes anterior"
          onClick={() => {
            haptic.tap();
            onMonthChange(addMonths(from, -1));
          }}
        >
          <Icon name="chevron-left" size={18} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          className="cal-title"
          aria-label={`${formatMonthLong(from)}. Ir a hoy`}
          onClick={() => {
            haptic.tap();
            onMonthChange(today);
            onSelect(today);
          }}
        >
          {formatMonthLong(from)}
        </button>
        <button
          type="button"
          className="period-nav-btn btn-tap"
          aria-label="Mes siguiente"
          onClick={() => {
            haptic.tap();
            onMonthChange(addMonths(from, 1));
          }}
        >
          <Icon name="chevron-right" size={18} strokeWidth={2.2} />
        </button>
      </div>
      <div className="cal-weekdays" aria-hidden="true">
        {WEEKDAYS.map((d, i) => (
          <span className="cal-weekday" key={i}>
            {d}
          </span>
        ))}
      </div>
      <div className="cal-grid" role="grid" aria-label={formatMonthLong(from)}>
        {cells.map((iso) => {
          const outside = iso < from || iso > to;
          const dots = byDay.get(iso) ?? [];
          const cls = [
            "cal-day",
            outside ? "cal-day--outside" : "",
            iso < today ? "cal-day--past" : "",
            iso === today ? "cal-day--today" : "",
            iso === selected ? "cal-day--selected" : ""
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              type="button"
              key={iso}
              className={cls}
              role="gridcell"
              aria-selected={iso === selected}
              aria-label={`${parseISODate(iso).getDate()}${dots.length ? `, ${dots.length} ${dots.length === 1 ? "evento" : "tipos de evento"}` : ""}`}
              onClick={() => {
                haptic.tap();
                if (outside) onMonthChange(iso);
                onSelect(iso);
              }}
            >
              <span className="cal-day-num">{parseISODate(iso).getDate()}</span>
              <span className="cal-dots" aria-hidden="true">
                {dots.slice(0, MAX_DOTS).map((c) => (
                  <span className="cal-dot" key={c} style={{ background: c }} />
                ))}
                {dots.length > MAX_DOTS && <span className="cal-dot--more" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
