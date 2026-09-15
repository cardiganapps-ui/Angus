import { useState } from "react";
import { Icon } from "./Icon";
import { PickerSheet, type PickerOption } from "./PickerSheet";

/* ── PickerField ──
   Entity-reference selector that replaces a native <select>. Renders
   as an .input-styled button (label left, chevron right) and opens a
   PickerSheet on tap. `value === ""` means "Ninguno". The sheet
   stacks over the parent sheet; useEscape's topmost-only stack means
   Escape / back closes just the picker. */
export function PickerField({
  title,
  options,
  value,
  onChange,
  placeholder = "Ninguno"
}: {
  title: string;
  options: PickerOption[];
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <button
        type="button"
        className={`picker-field ${selected ? "" : "picker-field--empty"}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="picker-field-label">{selected ? selected.label : placeholder}</span>
        <span className="picker-field-chevron" aria-hidden="true">
          <Icon name="chevron-right" size={16} strokeWidth={2} />
        </span>
      </button>
      {open && (
        <PickerSheet
          title={title}
          options={options}
          value={value}
          placeholder={placeholder}
          onSelect={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
