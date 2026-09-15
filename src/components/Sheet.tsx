import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { SheetOverlay } from "./SheetOverlay";
import { useEscape } from "../hooks/useEscape";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useSheetDrag } from "../hooks/useSheetDrag";
import { useSheetExit } from "../hooks/useSheetExit";

/* ── Sheet ──
   The canonical bottom sheet, composed exactly like a Cardigan sheet
   (see Cardigan's PaymentModal / SessionSheet):

     <SheetOverlay>                        scrim + click-outside
       <div class="sheet-panel">           scroll container + drag target
         <div class="sheet-handle" />
         <div class="sheet-header">        .sheet-title + .sheet-close
         <div class="sheet-body">          form content
         <div class="sheet-footer">        sticky CTA column (border-top)

   Wiring: useSheetExit (animated close → parent onClose after 260ms),
   useEscape (topmost-only ESC stack), useFocusTrap (parks focus on the
   panel, cycles Tab inside), useSheetDrag (drag-to-dismiss + overscroll
   bounce; owns its own dismiss animation so it takes the RAW onClose).

   `onClose === null` means "can't close right now" (submitting): the
   scrim, ESC, the X button and drag-dismiss all go inert. */

const noop = () => {};

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
  const closable = !!onClose;
  const { exiting, animatedClose } = useSheetExit(true, onClose);
  useEscape(closable ? animatedClose : null);
  const panelRef = useFocusTrap(true);
  const { scrollRef, setPanelEl, panelHandlers } = useSheetDrag(onClose ?? noop, { isOpen: true });
  const setPanel = (el: HTMLElement | null) => {
    panelRef.current = el;
    scrollRef.current = el;
    setPanelEl(el);
  };

  return (
    <SheetOverlay exiting={exiting} onClose={closable ? animatedClose : null}>
      <div
        ref={setPanel}
        className={`sheet-panel ${exiting ? "sheet-panel--exit" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        {...panelHandlers}
        style={{ maxHeight: "min(92lvh, calc(100lvh - var(--sat) - 16px))" }}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <span className="sheet-title">{title}</span>
          <button
            type="button"
            className="sheet-close"
            aria-label="Cerrar"
            onClick={() => animatedClose()}
            disabled={!closable}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </SheetOverlay>
  );
}
