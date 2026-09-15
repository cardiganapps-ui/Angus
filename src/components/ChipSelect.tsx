import { haptic } from "../lib/haptics";

/* ── ChipSelect ──
   Single-choice chip row for enums with too many options for a
   segmented control (relationship, lead stage, event kind). Same
   .chip vocabulary as Cardigan's filter chips: white pill at rest,
   teal fill when active, spring scale on press. An optional `color`
   per option renders the event-kind dot before the label; the active
   chip rings the dot in currentColor (white on teal) so it stays
   visible instead of vanishing into the fill. */
export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
  ariaLabel
}: {
  options: { value: T; label: string; color?: string }[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="chip-row" role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`chip ${active ? "active" : ""}`}
            onClick={() => {
              if (active) return;
              haptic.tap();
              onChange(opt.value);
            }}
          >
            {opt.color && <span className="event-dot" style={{ background: opt.color }} aria-hidden="true" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
