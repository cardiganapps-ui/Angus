import { useState, useRef, useCallback } from "react";
import type { ToastEntry } from "../components/Toast";

/* ── useToastQueue ──
   Port of Cardigan's single toast channel: every surface pushes into
   ONE queue; the UI renders up to MAX_TOASTS with a stagger, oldest
   fading first. Persistent toasts don't auto-dismiss — a rejected write
   or a failed read stays until she acknowledges it (DataErrorToast),
   which is why the over-cap eviction below evicts non-persistent
   entries first and a repeated failure must pass a `key`. */

const MAX_TOASTS = 5;

export interface ToastOptions {
  persistent?: boolean;
  duration?: number;
  onRetry?: () => void;
  actionLabel?: React.ReactNode;
  /** De-dupe key: an earlier entry with the same key is replaced. */
  key?: string;
}

export function useToastQueue() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextToastIdRef = useRef(0);

  const showToast = useCallback((msg: string, type: ToastEntry["kind"] = "info", opts: ToastOptions = {}) => {
    if (!msg) return null;
    const id = ++nextToastIdRef.current;
    setToasts((prev) => {
      const base = opts.key ? prev.filter((t2) => t2.key !== opts.key) : prev;
      const next: ToastEntry[] = [...base, {
        id, kind: type, message: msg,
        persistent: !!opts.persistent,
        duration: opts.duration,
        onRetry: opts.onRetry,
        actionLabel: opts.actionLabel,
        key: opts.key,
      }];
      if (next.length <= MAX_TOASTS) return next;
      // Over cap: drop oldest non-persistent first.
      const out: ToastEntry[] = [];
      let toDrop = next.length - MAX_TOASTS;
      for (const t2 of next) {
        if (toDrop > 0 && !t2.persistent) { toDrop--; continue; }
        out.push(t2);
      }
      return out;
    });
    return id;
  }, []);

  const dismissToast = useCallback((id: string | number) => {
    setToasts((prev) => prev.filter((t2) => t2.id !== id));
  }, []);

  const showSuccess = useCallback((msg: string) => {
    if (!msg) return;
    showToast(msg, "success");
  }, [showToast]);

  return { toasts, showToast, showSuccess, dismissToast };
}
