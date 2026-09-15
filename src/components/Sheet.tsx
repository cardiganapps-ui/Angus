import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";

export function Sheet({
  title,
  onClose,
  children,
  footer
}: {
  title: string;
  onClose: (() => void) | null;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="sheet-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="sheet-panel">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div className="sheet-title">{title}</div>
          <button
            className="btn-tap"
            aria-label="Cerrar"
            onClick={() => onClose?.()}
            disabled={!onClose}
          >
            <Icon name="x" />
          </button>
        </div>
        <div className="sheet-body scroll-bounce">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>
  );
}
