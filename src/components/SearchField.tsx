import { Icon } from "./Icon";

/* ── SearchField ──
   A pill input with a magnifier and a clear button. 16px font so iOS
   doesn't zoom on focus. */
export function SearchField({
  value,
  onChange,
  placeholder,
  ariaLabel
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  return (
    <div className="search-field">
      <Icon name="search" size={18} />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" className="search-field-clear" aria-label="Borrar búsqueda" onClick={() => onChange("")}>
          <Icon name="x" size={14} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}
