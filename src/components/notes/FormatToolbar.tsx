/* ── Format toolbar ──
   The bar of format buttons above the editor. Purely presentational:
   it lights up the formats under the caret (the `active` set from
   MarkdownEditor's onSelectionChange) and calls back when a button is
   tapped; the parent forwards to the editor's imperative ref. */

function isMac() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");
}
const MOD_LABEL = isMac() ? "⌘" : "Ctrl";

function Tool({
  label,
  hint,
  active,
  onClick,
  disabled,
  children
}: {
  label: string;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={"mde-tool" + (active ? " is-active" : "")}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      /* Only the format toggles are toggles. "Adjuntar imagen" has no
         `active` at all, and an unconditional aria-pressed made it
         announce as a permanently-unpressed toggle button. */
      aria-pressed={active === undefined ? undefined : active}
    >
      {children}
      {hint && (
        <span className="mde-tool-hint">
          {label} · {hint}
        </span>
      )}
    </button>
  );
}

function Sep() {
  return <div className="mde-tool-sep" aria-hidden="true" />;
}

const IconBold = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 5h6.5a3.5 3.5 0 0 1 0 7H7z" />
    <path d="M7 12h7.5a3.5 3.5 0 0 1 0 7H7z" />
  </svg>
);
const IconItalic = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
    <line x1="15" y1="5" x2="9" y2="19" />
    <line x1="11" y1="5" x2="18" y2="5" />
    <line x1="6" y1="19" x2="13" y2="19" />
  </svg>
);
const IconStrike = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12h16" />
    <path d="M8.5 8.5C9.5 7 11 6 13 6c2.5 0 4 1.5 4 3" />
    <path d="M15 15c0 2-1.5 3-4 3-2.5 0-4-1.3-4-3" />
  </svg>
);
const IconHighlight = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 17l-4 4 1-5 8-12 4 4z" />
    <path d="M13 4l3 3" />
    <path d="M5 21h6" />
  </svg>
);
const IconH1 = () => (
  <svg width="20" height="18" viewBox="0 0 28 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6v12M12 6v12M4 12h8" />
    <path d="M17 10l3-2v10" />
  </svg>
);
const IconH2 = () => (
  <svg width="20" height="18" viewBox="0 0 28 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6v12M12 6v12M4 12h8" />
    <path d="M17 10c0-1.5 1-2 2.5-2s2.5 0.8 2.5 2.3c0 2.2-5 3.7-5 7.7h5" />
  </svg>
);
const IconH3 = () => (
  <svg width="20" height="18" viewBox="0 0 28 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6v12M12 6v12M4 12h8" />
    <path d="M17 9c0-1 1-2 2.5-2s2.5 1 2.5 2-1 2-2.5 2c1.5 0 2.5 1 2.5 2.5s-1 2.5-2.5 2.5-2.5-1-2.5-2" />
  </svg>
);
const IconBullet = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
    <circle cx="5" cy="7" r="1.5" fill="currentColor" stroke="none" />
    <line x1="10" y1="7" x2="20" y2="7" />
    <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <line x1="10" y1="12" x2="20" y2="12" />
    <circle cx="5" cy="17" r="1.5" fill="currentColor" stroke="none" />
    <line x1="10" y1="17" x2="20" y2="17" />
  </svg>
);
const IconNumbered = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <line x1="10" y1="7" x2="20" y2="7" />
    <line x1="10" y1="12" x2="20" y2="12" />
    <line x1="10" y1="17" x2="20" y2="17" />
    <text x="1" y="9" fontSize="7" fontWeight="700" fontFamily="Nunito, sans-serif" fill="currentColor" stroke="none">1</text>
    <text x="1" y="14.5" fontSize="7" fontWeight="700" fontFamily="Nunito, sans-serif" fill="currentColor" stroke="none">2</text>
    <text x="1" y="20" fontSize="7" fontWeight="700" fontFamily="Nunito, sans-serif" fill="currentColor" stroke="none">3</text>
  </svg>
);
const IconTask = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="6" height="6" rx="1.4" />
    <line x1="12" y1="7" x2="21" y2="7" />
    <rect x="3" y="14" width="6" height="6" rx="1.4" />
    <path d="M4.5 17l1.5 1.5 2.5-3" />
    <line x1="12" y1="17" x2="21" y2="17" />
  </svg>
);
const IconPaperclip = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5L11 17.5a2 2 0 0 1-3-3l7-7" />
  </svg>
);

export function FormatToolbar({
  active,
  onInline,
  onBlock,
  disabled,
  onAttachClick
}: {
  active?: Set<string>;
  onInline: (kind: string) => void;
  onBlock: (block: string) => void;
  disabled?: boolean;
  /** Present once Material (Stage 4) lets her drop an image into the body. */
  onAttachClick?: () => void;
}) {
  const has = (k: string) => active?.has(k) ?? false;
  return (
    <div className="mde-toolbar" role="toolbar" aria-label="Formato">
      <Tool label="Negrita" hint={`${MOD_LABEL}B`} active={has("strong")} onClick={() => onInline("strong")} disabled={disabled}>
        <IconBold />
      </Tool>
      <Tool label="Cursiva" hint={`${MOD_LABEL}I`} active={has("em")} onClick={() => onInline("em")} disabled={disabled}>
        <IconItalic />
      </Tool>
      <Tool label="Tachado" hint={`${MOD_LABEL}⇧X`} active={has("strike")} onClick={() => onInline("strike")} disabled={disabled}>
        <IconStrike />
      </Tool>
      <Tool label="Resaltar" hint={`${MOD_LABEL}⇧H`} active={has("mark")} onClick={() => onInline("mark")} disabled={disabled}>
        <IconHighlight />
      </Tool>
      <Sep />
      <Tool label="Título 1" hint={`${MOD_LABEL}1`} active={has("h1")} onClick={() => onBlock("h1")} disabled={disabled}>
        <IconH1 />
      </Tool>
      <Tool label="Título 2" hint={`${MOD_LABEL}2`} active={has("h2")} onClick={() => onBlock("h2")} disabled={disabled}>
        <IconH2 />
      </Tool>
      <Tool label="Título 3" hint={`${MOD_LABEL}3`} active={has("h3")} onClick={() => onBlock("h3")} disabled={disabled}>
        <IconH3 />
      </Tool>
      <Sep />
      <Tool label="Lista" hint={`${MOD_LABEL}⇧8`} active={has("ul")} onClick={() => onBlock("ul")} disabled={disabled}>
        <IconBullet />
      </Tool>
      <Tool label="Numerada" hint={`${MOD_LABEL}⇧7`} active={has("ol")} onClick={() => onBlock("ol")} disabled={disabled}>
        <IconNumbered />
      </Tool>
      <Tool label="Checklist" hint={`${MOD_LABEL}⇧9`} active={has("task")} onClick={() => onBlock("task")} disabled={disabled}>
        <IconTask />
      </Tool>
      {onAttachClick && (
        <>
          <Sep />
          <Tool label="Adjuntar imagen" onClick={onAttachClick} disabled={disabled}>
            <IconPaperclip />
          </Tool>
        </>
      )}
    </div>
  );
}
