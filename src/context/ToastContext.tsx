import { createContext, useContext, type ReactNode } from "react";
import { ToastStack } from "../components/Toast";
import { useToastQueue, type ToastOptions } from "../hooks/useToastQueue";
import type { ToastEntry } from "../components/Toast";

/* Toast channel exposed to screens + sheets. Mount INSIDE `.shell` —
   the toast anchors to the shell's measured --chrome-top-overlap. */

interface ToastContextValue {
  showToast: (msg: string, type?: ToastEntry["kind"], opts?: ToastOptions) => number | null;
  showSuccess: (msg: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { toasts, showToast, showSuccess, dismissToast } = useToastQueue();
  return (
    <ToastContext.Provider value={{ showToast, showSuccess }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
