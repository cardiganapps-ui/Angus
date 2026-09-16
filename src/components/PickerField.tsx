import { useId, useState } from "react";
import { Icon } from "./Icon";
import { PickerSheet, type PickerOption } from "./PickerSheet";
import { domId } from "../utils/id";

/* ── PickerField ──
   Entity-reference selector that replaces a native <select>. Renders
   as an .input-styled button (label left, chevron right) and opens a
   PickerSheet on tap. `value === ""` means "Ninguno". The sheet
   stacks over the parent sheet; useEscape's topmost-only stack means
   Escape / back closes just the picker.

   Accessible name: the visible caption above a picker is a plain
   <span class="input-label"> that the CALLER renders — a <label for>
   can't reach a <button>, and the caption isn't always paired 1:1 with
   a field (AssignmentSheet and NoteLinkFields keep the caption and swap
   the picker for an .input-help when there is nothing to pick yet). So
   the caller keeps the caption, puts an id on it, and hands that id
   here: `aria-labelledby` then points at the caption element itself
   plus the value span, and the name computes to "<campo> <valor>" from
   the very text on screen. Nothing is duplicated, so nothing can drift
   — the earlier fix copied the title into .sr-only text, which
   announced correctly but was a second copy of the caption waiting to
   disagree with it (three call sites already show a caption that reads
   differently from `title`).

   Without `labelId` it falls back to that sr-only copy, so a picker in
   a sheet that hasn't been wired yet still announces its field name. */
export function PickerField({
  title,
  options,
  value,
  onChange,
  placeholder = "Ninguno",
  labelId
}: {
  title: string;
  options: PickerOption[];
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** id of the visible .input-label above this field. */
  labelId?: string;
}) {
  const [open, setOpen] = useState(false);
  const valueId = `picker-value-${domId(useId())}`;
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <button
        type="button"
        className={`picker-field ${selected ? "" : "picker-field--empty"}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={labelId ? `${labelId} ${valueId}` : undefined}
      >
        {!labelId && <span className="sr-only">{title}</span>}
        <span className="picker-field-label" id={valueId}>{selected ? selected.label : placeholder}</span>
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
