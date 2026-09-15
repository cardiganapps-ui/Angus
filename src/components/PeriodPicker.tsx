import { Icon } from "./Icon";
import { SegmentedControl } from "./SegmentedControl";
import { addMonths, todayISO } from "../utils/dates";
import { periodRange, type Period, type PeriodSpan } from "../utils/period";
import { haptic } from "../lib/haptics";

/* ── PeriodPicker ──
   Month / 3 months / year, with chevrons to move the anchor. The value
   is the anchor date + the span; `periodRange()` turns it into the
   inclusive {from, to} every money helper takes. */

const ITEMS = [
  { k: "month", l: "Mes" },
  { k: "quarter", l: "3 meses" },
  { k: "year", l: "Año" }
];

function shift(period: Period, direction: 1 | -1): Period {
  const months = period.span === "year" ? 12 : period.span === "quarter" ? 3 : 1;
  return { ...period, anchor: addMonths(period.anchor, months * direction) };
}

export function PeriodPicker({
  value,
  onChange,
  ariaLabel = "Periodo"
}: {
  value: Period;
  onChange: (next: Period) => void;
  ariaLabel?: string;
}) {
  const { label } = periodRange(value);
  const isCurrent = periodRange(value).to >= todayISO();
  return (
    <div className="period-picker">
      <SegmentedControl
        items={ITEMS}
        value={value.span}
        onChange={(k) => onChange({ ...value, span: k as PeriodSpan })}
        size="sm"
        ariaLabel={ariaLabel}
      />
      <div className="period-nav">
        <button
          type="button"
          className="period-nav-btn btn-tap"
          aria-label="Periodo anterior"
          onClick={() => {
            haptic.tap();
            onChange(shift(value, -1));
          }}
        >
          <Icon name="chevron-left" size={18} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          className="period-nav-label btn-tap"
          onClick={() => {
            haptic.tap();
            onChange({ ...value, anchor: todayISO() });
          }}
          aria-label={`${label}. Volver al periodo actual`}
        >
          {label}
        </button>
        <button
          type="button"
          className="period-nav-btn btn-tap"
          aria-label="Periodo siguiente"
          disabled={isCurrent}
          onClick={() => {
            haptic.tap();
            onChange(shift(value, 1));
          }}
        >
          <Icon name="chevron-right" size={18} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}
