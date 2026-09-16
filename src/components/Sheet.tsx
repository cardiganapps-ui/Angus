import { useCallback, useEffect, useId, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Icon } from "./Icon";
import { SheetOverlay } from "./SheetOverlay";
import { useEscape } from "../hooks/useEscape";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useSheetDrag } from "../hooks/useSheetDrag";
import { useSheetExit } from "../hooks/useSheetExit";
import { haptic } from "../lib/haptics";
import { domId } from "../utils/id";

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
   scrim, ESC, the X button and drag-dismiss all go inert.

   `closeRef` (optional) receives the animated close so a child can
   dismiss the sheet programmatically with the same exit animation
   the X button uses — e.g. PickerSheet closing itself on selection.

   ── Unsaved-changes guard ──
   `dirty` is the one place a form says "she has typing in here". All
   four dismissal paths — scrim tap, Escape, handle flick, the close X —
   run through `allowDismiss`, so a guard cannot be skipped by picking a
   different gesture. Dirty turns the dismissal into an in-place confirm
   in the footer, borrowing SheetActions' two-state vocabulary (question
   text over a danger button and a way back) rather than inventing a
   second idiom. The pre-confirm footer stays mounted as an invisible
   twin so the panel doesn't jump on the swap.

   This is deliberately scoped to the sheet: no `beforeunload`. A PWA
   that throws a browser-chrome "leave site?" dialog is a worse problem
   than the one it solves. */

const noop = () => {};

const DEFAULT_DISCARD = "¿Descartar los cambios? Lo que escribiste aquí no se guarda.";

export function Sheet({
  title,
  onClose,
  children,
  footer,
  closeRef,
  dirty = false,
  discardText = DEFAULT_DISCARD
}: {
  title: string;
  onClose: (() => void) | null;
  children: ReactNode;
  footer?: ReactNode;
  closeRef?: MutableRefObject<(() => void) | null>;
  /** True while the form holds edits that were never saved. */
  dirty?: boolean;
  /** What she loses, in her words. Shown above "Sí, descartar". */
  discardText?: string;
}) {
  const closable = !!onClose;
  const { exiting, animatedClose } = useSheetExit(true, onClose);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const questionId = `sheet-discard-q-${domId(useId())}`;

  /* The drag decides at release, outside React's render pass, so the
     veto has to read live values instead of whatever was captured when
     the handler was built. */
  const guardRef = useRef({ closable, dirty });
  useEffect(() => {
    guardRef.current = { closable, dirty };
  }, [closable, dirty]);

  /* The single gate every dismissal path goes through. False means the
     sheet stays: either a write is in flight (nothing to ask about) or
     there are unsaved edits, in which case it arms the confirm. */
  const allowDismiss = useCallback(() => {
    const { closable: canClose, dirty: hasEdits } = guardRef.current;
    if (!canClose) return false;
    if (!hasEdits) return true;
    setConfirmingDiscard(true);
    haptic.warn();
    return false;
  }, []);

  const requestClose = useCallback(() => {
    if (allowDismiss()) animatedClose();
  }, [allowDismiss, animatedClose]);
  const cancelDiscard = useCallback(() => setConfirmingDiscard(false), []);

  // Escape backs out of the innermost thing: the confirm first, the
  // sheet second.
  const onEscape = confirmingDiscard ? cancelDiscard : requestClose;
  useEscape(closable ? onEscape : null);

  useEffect(() => {
    if (!closeRef) return;
    closeRef.current = closable ? () => animatedClose() : null;
    return () => { closeRef.current = null; };
  }, [closeRef, closable, animatedClose]);

  const panelRef = useFocusTrap(true);
  const { scrollRef, setPanelEl, panelHandlers } = useSheetDrag(onClose ?? noop, {
    isOpen: true,
    beforeDismiss: allowDismiss
  });
  const setPanel = (el: HTMLElement | null) => {
    panelRef.current = el;
    scrollRef.current = el;
    setPanelEl(el);
  };

  /* Arming the confirm unmounts the footer subtree that held focus, so
     the browser drops focus to <body> and the question simply does not
     exist for a keyboard or a screen reader. Moved by hand in both
     directions, same as SheetActions. Cancelling parks focus back on
     the panel rather than a button: the dismissal may have come from
     the scrim or a swipe, where there is no button to return to.
     Seeded from the initial state so mounting never steals focus. */
  const discardRef = useRef<HTMLButtonElement>(null);
  const prevConfirming = useRef(confirmingDiscard);
  useEffect(() => {
    if (confirmingDiscard === prevConfirming.current) return;
    prevConfirming.current = confirmingDiscard;
    if (confirmingDiscard) {
      discardRef.current?.focus();
      return;
    }
    const panel = panelRef.current;
    if (!panel) return;
    // useFocusTrap only stamps tabindex when it had to park focus
    // itself, so a sheet that autoFocused an input never got one — and
    // focusing a div without it drops focus to <body>.
    if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
    try { panel.focus({ preventScroll: true }); } catch { panel.focus(); }
  }, [confirmingDiscard, panelRef]);

  const discardConfirm = (
    <div className="sheet-actions-state" key="discard">
      <div className="input-help sheet-actions-question" id={questionId}>{discardText}</div>
      <button
        type="button"
        ref={discardRef}
        className="btn btn-danger"
        onClick={() => animatedClose()}
        aria-describedby={questionId}
      >
        Sí, descartar
      </button>
      <button type="button" className="btn btn-secondary" onClick={cancelDiscard}>
        Seguir editando
      </button>
    </div>
  );

  return (
    <SheetOverlay exiting={exiting} onClose={closable ? requestClose : null}>
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
            onClick={requestClose}
            disabled={!closable}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {(footer || confirmingDiscard) && (
          <div className="sheet-footer">
            {confirmingDiscard ? (
              <div className="sheet-actions">
                {/* The footer she came from, kept as an inert twin so the
                    panel's height is the max of both states and nothing
                    jumps on the swap. */}
                {footer && <div className="sheet-actions-ghost" aria-hidden="true" inert>{footer}</div>}
                {discardConfirm}
              </div>
            ) : (
              footer
            )}
          </div>
        )}
      </div>
    </SheetOverlay>
  );
}
