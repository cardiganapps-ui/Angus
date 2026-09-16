import { useState, useEffect, useRef, useCallback } from "react";
import { Icon } from "./Icon";
import { haptic } from "../lib/haptics";

/* ── Toast ──
   Port of Cardigan's Toast.tsx (Liquid Glass panel with a type-tinted
   edge stripe + swipe-up-to-dismiss). i18n strings are inlined and the
   icon set is Angus's <Icon>; everything else is 1:1. */

/* Inline alert glyph for warning + error toasts. Stroke-2 to match
   the rest of the icon family. */
function GlyphAlert({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 9v4" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    </svg>
  );
}

export type ToastKind = "success" | "error" | "warning" | "info";

export function Toast({ message, type = "error", duration, onDismiss, onRetry, actionLabel, persistent = false, stackIndex = 0 }: {
  message?: string;
  type?: ToastKind | string;
  duration?: number;
  onDismiss?: () => void;
  onRetry?: () => void;
  actionLabel?: React.ReactNode;
  persistent?: boolean;
  stackIndex?: number;
}) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Uniform short fade across every type: 900ms + the 560ms fade-out
  // is long enough to read a short Spanish phrase, short enough to
  // feel snappy. Persistent toasts (errors with a retry) opt out.
  const effectiveDuration = duration ?? 900;

  // Flip visibility synchronously when the message prop changes —
  // adjust-state-during-render so the toast enters/exits without a
  // set-state-in-effect cascade. prevMessage seeds to null (NOT
  // message) so the first render with a message triggers the flip.
  const [prevMessage, setPrevMessage] = useState<string | null | undefined>(null);
  if (message !== prevMessage) {
    setPrevMessage(message);
    if (message) { setVisible(true); setLeaving(false); }
    else { setVisible(false); }
  }
  // Keep in lockstep with the toastOut keyframe duration in base.css.
  const DISMISS_MS = 560;
  useEffect(() => {
    if (!message || persistent) return;
    const timer = setTimeout(() => {
      setLeaving(true);
      setTimeout(() => { setVisible(false); onDismiss?.(); }, DISMISS_MS);
    }, effectiveDuration);
    return () => clearTimeout(timer);
  }, [message, effectiveDuration, onDismiss, persistent]);

  if (!visible || !message) return null;

  const dismiss = () => { setLeaving(true); setTimeout(() => { setVisible(false); onDismiss?.(); }, DISMISS_MS); };

  const glyph = type === "success" ? <Icon name="check" size={14} strokeWidth={2.4} />
    : type === "warning" || type === "error" ? <GlyphAlert size={14} />
    : null;

  // Stacking offset: each subsequent toast is ~58px further down, with
  // a slight scale fade so older entries recede visually. Anchored just
  // below the floating top chrome (measured --chrome-top-overlap).
  const top = `calc(max(var(--chrome-top-overlap, 0px) + 6px, var(--sat, 44px) + 52px) + ${stackIndex * 58}px)`;
  const opacity = stackIndex === 0 ? 1 : Math.max(0.75, 1 - stackIndex * 0.1);
  const scale = stackIndex === 0 ? 1 : Math.max(0.94, 1 - stackIndex * 0.03);

  const isInterrupt = type === "error" || type === "warning";
  const liveRole = isInterrupt ? "alert" : "status";
  const liveness = isInterrupt ? "assertive" : "polite";

  // Swipe-up-to-dismiss bypasses the toastOut keyframe path — the
  // gesture already slid the toast off-screen with its own transform.
  const forceRemove = () => { setVisible(false); onDismiss?.(); };

  return (
    <SwipeDismissToast
      scale={scale}
      opacity={opacity}
      top={top}
      leaving={leaving}
      onSwipeRemove={forceRemove}
      liveRole={liveRole}
      liveness={liveness}>
      <div className={`toast-panel toast-panel--${type}`} data-type={type}>
        {glyph && (
          <span className="toast-icon" aria-hidden>
            {glyph}
          </span>
        )}
        {/* The message IS the accessible name of the live region. An
            aria-label here replaces the text content in the name
            computation, so this element used to announce the rejected
            write as "Cerrar, botón" and the failure was never spoken —
            the exact silent data loss the Prime Directive exists to
            prevent. Tap-to-dismiss stays for pointers; the named
            control is the sibling button. */}
        <span onClick={dismiss} className="toast-message">{message}</span>
        {onRetry && (
          <button onClick={(e) => { e.stopPropagation(); onRetry(); dismiss(); }}
            className="toast-action">
            {actionLabel || "Reintentar"}
          </button>
        )}
        {/* Rendered for every toast, not just the ones without an
            action: a persistent toast whose only dismissal was a
            pointer tap or a swipe left keyboard and switch users with
            no way to close it. */}
        <button onClick={(e) => { e.stopPropagation(); dismiss(); }}
          aria-label="Cerrar aviso"
          className="toast-close">
          <Icon name="x" size={14} />
        </button>
      </div>
    </SwipeDismissToast>
  );
}

/* ── SwipeDismissToast ──
   Owns the toast's positioning, entrance/exit animation AND a
   swipe-up-to-dismiss gesture. Direct DOM mutation during the drag
   keeps it at 60fps. Engage after ≥6px; upward follows 1:1, downward
   damped at 0.3×; release past 50px up → dismiss, else spring back. */
function SwipeDismissToast({ scale, opacity, top, leaving, onSwipeRemove, liveRole, liveness, children }: {
  scale: number;
  opacity: number;
  top: string;
  leaving?: boolean;
  onSwipeRemove: () => void;
  liveRole?: string;
  liveness?: "assertive" | "polite" | "off";
  children?: React.ReactNode;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startY: 0, dy: 0, dragging: false });

  const SETTLE = "transform var(--dur-slow) var(--ease-spring)";
  const STACK_TRANSITION = "top var(--dur-slow) var(--ease-spring), transform var(--dur-base) var(--ease-out), opacity var(--dur-base) var(--ease-out)";
  const SLIDE_OUT_MS = 240;

  const restingTransform = `scale(${scale})`;

  // If the auto-dismiss timer fires mid-drag, abort the drag and clear
  // the inline overrides so the toastOut keyframe runs cleanly.
  useEffect(() => {
    if (!leaving) return;
    const el = wrapperRef.current;
    if (!el || !dragRef.current.dragging) return;
    dragRef.current = { startY: 0, dy: 0, dragging: false };
    el.style.transform = "";
    el.style.transition = "";
    el.style.animation = "";
  }, [leaving]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const el = wrapperRef.current;
    if (!el || leaving) return;
    const t = e.touches[0];
    if (!t) return;
    dragRef.current = { startY: t.clientY, dy: 0, dragging: false };
  }, [leaving]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const el = wrapperRef.current;
    if (!el) return;
    const t = e.touches[0];
    if (!t) return;
    const dy = t.clientY - dragRef.current.startY;
    if (!dragRef.current.dragging) {
      if (Math.abs(dy) < 6) return;
      dragRef.current.dragging = true;
      el.style.animation = "none";
      el.style.transition = "none";
    }
    const clamped = dy < 0 ? dy : dy * 0.3;
    dragRef.current.dy = clamped;
    el.style.transform = `scale(${scale}) translateY(${clamped}px)`;
  }, [scale]);

  const onTouchEnd = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const { dy, dragging } = dragRef.current;
    dragRef.current.dragging = false;
    if (!dragging) return;
    if (dy < -50) {
      haptic.tap();
      el.style.transition = `transform ${SLIDE_OUT_MS}ms var(--ease-in), opacity ${SLIDE_OUT_MS}ms var(--ease-out)`;
      el.style.transform = `scale(${scale}) translateY(-${Math.abs(dy) + 60}px)`;
      el.style.opacity = "0";
      setTimeout(onSwipeRemove, SLIDE_OUT_MS + 20);
      return;
    }
    el.style.transition = SETTLE;
    el.style.transform = restingTransform;
    setTimeout(() => {
      if (wrapperRef.current === el) {
        el.style.transition = STACK_TRANSITION;
        el.style.animation = "";
      }
    }, 340);
  }, [scale, restingTransform, STACK_TRANSITION, onSwipeRemove]);

  const onTouchCancel = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (!dragRef.current.dragging) {
      dragRef.current = { startY: 0, dy: 0, dragging: false };
      return;
    }
    dragRef.current.dragging = false;
    el.style.transition = SETTLE;
    el.style.transform = restingTransform;
    setTimeout(() => {
      if (wrapperRef.current === el) {
        el.style.transition = STACK_TRANSITION;
        el.style.animation = "";
      }
    }, 340);
  }, [restingTransform, SETTLE, STACK_TRANSITION]);

  return (
    <div
      ref={wrapperRef}
      role={liveRole}
      aria-live={liveness}
      aria-atomic="true"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      style={{
        position: "fixed", top, left: 12, right: 12,
        zIndex: "var(--z-install)", pointerEvents: "auto",
        animation: leaving
          ? "toastOut 560ms var(--ease-in-out) forwards"
          : "toastIn var(--dur-slower) var(--ease-spring)",
        opacity,
        transform: restingTransform,
        transformOrigin: "top center",
        touchAction: "pan-x",
        transition: STACK_TRANSITION,
      }}>
      {children}
    </div>
  );
}

export interface ToastEntry {
  id: string | number;
  message?: string;
  kind?: ToastKind | string;
  persistent?: boolean;
  duration?: number;
  onRetry?: () => void;
  actionLabel?: React.ReactNode;
  key?: string;
}

/**
 * ToastStack — renders up to `max` toasts as a vertical stack, newest
 * at index 0 (top) and older entries offset below with a subtle
 * opacity + scale decay.
 */
export function ToastStack({ toasts, onDismiss, max = 3 }: {
  toasts: ToastEntry[];
  onDismiss: (id: string | number) => void;
  max?: number;
}) {
  const visible = toasts.slice(-max);
  const reversed = [...visible].reverse();
  return reversed.map((toast, i) => (
    <Toast
      key={toast.id}
      stackIndex={i}
      message={toast.message}
      type={toast.kind}
      persistent={toast.persistent}
      duration={toast.duration}
      onDismiss={() => onDismiss(toast.id)}
      onRetry={toast.onRetry}
      actionLabel={toast.actionLabel}
    />
  ));
}
