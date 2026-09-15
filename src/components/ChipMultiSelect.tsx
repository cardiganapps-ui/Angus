import { haptic } from "../lib/haptics";

/* ── ChipMultiSelect ──
   The multi-choice sibling of ChipSelect: same .chip vocabulary, each
   chip toggles independently (aria-pressed). For "what do you do" and
   "which mediums" style questions where several answers are true. */
export function ChipMultiSelect<T extends string>({
  options,
  value,
  onChange,
  ariaLabel
}: {
  options: { value: T; label: string; color?: string }[];
  value: T[];
  onChange: (next: T[]) => void;
  ariaLabel: string;
}) {
  return (
    <div className="chip-row" role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = value.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            className={`chip ${active ? "active" : ""}`}
            onClick={() => {
              haptic.tap();
              onChange(active ? value.filter((v) => v !== opt.value) : [...value, opt.value]);
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
