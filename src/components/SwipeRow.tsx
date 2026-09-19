import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Icon } from "./Icon";
import { haptic } from "../lib/haptics";
import { domId } from "../utils/id";

/* ── SwipeRow ──
   Mail-style delete for a list row: drag left to reveal "Eliminar", tap
   it to arm an inline "¿Eliminar «…»?" with Sí / No in the row's own
   footprint, confirm, gone. On a pointer device the same action sits
   in a trash button that appears on hover or keyboard focus.

   The confirm step is not optional (Prime Directive #2): a full-length
   swipe arms the question, it never deletes by itself. `onDelete`
   resolves true once the server accepted — the parent then drops the
   row — or false after the store reverted and toasted, in which case
   the row simply closes back up.

   Gesture rules, so it can live inside the .page scroller under
   PullToRefresh: nothing happens until the pointer has moved 8px, and
   the row takes the gesture only when that movement is clearly more
   horizontal than vertical; otherwise it lets go and the page scrolls.
   `touch-action: pan-y` on the wrapper tells the browser the same
   thing, so a vertical flick is never delayed by us. One row is open at
   a time — opening another, tapping anywhere, or scrolling closes it. */

const HANDLE = 8; // px before a drag is a drag
const ACTION_W = 96; // px the action panel occupies when open
const ARM_AT = 0.55; // fraction of row width: past here, release arms the confirm

let closeOpenRow: (() => void) | null = null;

export function SwipeRow({
  label,
  question,
  onDelete,
  disabled = false,
  trashInset,
  children
}: {
  /** What the question names: the row's title. */
  label: string;
  /** Overrides the question when a delete carries more than the row (cascades). */
  question?: string;
  /** Resolves true when the server accepted the delete. */
  onDelete: () => Promise<boolean>;
  disabled?: boolean;
  /** Pointer-device trash button offset from the right edge, in px —
      raise it when the row already ends in a button (a pause toggle). */
  trashInset?: number;
  children: ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const noRef = useRef<HTMLButtonElement>(null);
  const start = useRef<{ x: number; y: number; from: number; id: number } | null>(null);
  const axis = useRef<"h" | "v" | null>(null);
  // Set by a drag so the click the browser fires afterwards is swallowed.
  const swallowClick = useRef(false);
  const questionId = `swipe-q-${domId(useId())}`;

  const close = useCallback(() => {
    setOffset(0);
    setConfirming(false);
  }, []);

  const open = useCallback(() => {
    if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
    closeOpenRow = close;
    setOffset(-ACTION_W);
  }, [close]);

  const arm = useCallback(() => {
    if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
    closeOpenRow = close;
    haptic.warn();
    setOffset(0);
    setConfirming(true);
  }, [close]);

  useEffect(() => {
    if (confirming) noRef.current?.focus();
  }, [confirming]);

  // A tap anywhere else, or a scroll, closes the open row.
  useEffect(() => {
    if (offset === 0 && !confirming) return;
    const onAway = (e: Event) => {
      if (rowRef.current && e.target instanceof Node && rowRef.current.contains(e.target)) return;
      close();
    };
    const onScroll = () => close();
    document.addEventListener("pointerdown", onAway, true);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onAway, true);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [offset, confirming, close]);

  useEffect(
    () => () => {
      if (closeOpenRow === close) closeOpenRow = null;
    },
    [close]
  );

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || confirming || busy) return;
    // Touch and pen only: a mouse gets the hover button, not a drag.
    if (e.pointerType === "mouse") return;
    // A new gesture: whatever the last one left armed no longer applies.
    swallowClick.current = false;
    start.current = { x: e.clientX, y: e.clientY, from: offset, id: e.pointerId };
    axis.current = null;
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (axis.current === null) {
      if (Math.abs(dx) < HANDLE && Math.abs(dy) < HANDLE) return;
      if (Math.abs(dx) > Math.abs(dy) * 1.2) {
        axis.current = "h";
        setDragging(true);
        rowRef.current?.setPointerCapture(e.pointerId);
      } else {
        axis.current = "v";
        start.current = null;
        return;
      }
    }
    if (axis.current !== "h") return;
    const width = rowRef.current?.offsetWidth ?? 320;
    // Past the panel the row keeps following the finger at a third of the pace.
    let next = s.from + dx;
    if (next > 0) next = 0;
    else if (next < -ACTION_W) next = -ACTION_W + (next + ACTION_W) / 3;
    if (next < -width) next = -width;
    setOffset(next);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const s = start.current;
    start.current = null;
    if (!s || axis.current !== "h") {
      axis.current = null;
      return;
    }
    axis.current = null;
    setDragging(false);
    const width = rowRef.current?.offsetWidth ?? 320;
    const dx = e.clientX - s.x;
    const travelled = -(s.from + dx);
    if (travelled >= width * ARM_AT) {
      // The content unmounts, so there is no click to swallow.
      arm();
      return;
    }
    swallowClick.current = true;
    if (travelled >= ACTION_W / 2) open();
    else close();
  }

  function onPointerCancel() {
    start.current = null;
    axis.current = null;
    setDragging(false);
    close();
  }

  function onClickCapture(e: React.MouseEvent) {
    if (swallowClick.current) {
      swallowClick.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // A tap on the content of an open row closes it instead of acting.
    if (offset !== 0) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    const ok = await onDelete();
    // On success the parent unmounts this row; only a refusal needs tidying.
    if (!ok) {
      setBusy(false);
      close();
    }
  }

  const q = question ?? `¿Eliminar “${label}”?`;

  return (
    <div
      ref={rowRef}
      className={`swipe-row ${dragging ? "is-dragging" : ""} ${offset !== 0 ? "is-open" : ""} ${confirming ? "is-confirming" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {confirming ? (
        <div className="swipe-row-confirm" role="group" aria-labelledby={questionId}>
          <div className="swipe-row-question" id={questionId}>{q}</div>
          <div className="swipe-row-confirm-actions">
            <button type="button" ref={noRef} className="btn btn-ghost btn-mini" onClick={close} disabled={busy}>
              No
            </button>
            <button
              type="button"
              className="btn btn-danger btn-mini"
              onClick={() => void confirm()}
              disabled={busy}
              aria-describedby={questionId}
            >
              {busy ? "Eliminando…" : "Sí, eliminar"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="swipe-row-actions" aria-hidden={offset === 0}>
            <button
              type="button"
              className="swipe-row-delete"
              tabIndex={offset === 0 ? -1 : 0}
              onClick={(e) => {
                e.stopPropagation();
                arm();
              }}
            >
              <Icon name="trash" size={20} strokeWidth={2} />
              <span>Eliminar</span>
            </button>
          </div>
          <div
            className="swipe-row-content"
            style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
            onClickCapture={onClickCapture}
          >
            {children}
          </div>
          {!disabled && (
            <button
              type="button"
              className="swipe-row-trash"
              style={trashInset ? { right: trashInset } : undefined}
              aria-label={`Eliminar ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                arm();
              }}
            >
              <Icon name="trash" size={16} strokeWidth={2} />
            </button>
          )}
        </>
      )}
    </div>
  );
}
