import { useEffect } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import { recordEvent } from "../lib/diagnostics";
import { describeWriteError } from "../lib/writeErrors";

// Two different failures, two different messages.
//
// `error` is a rejected WRITE — useCloudStore already reverted it, so the
// row she sees is the row the server has and her edit is gone. It is the
// MORE severe of the two and gets the stronger treatment: persistent, so
// a 900ms fade can't carry away the only notice that a write was lost,
// and `describeWriteError` for copy that names what happened instead of
// blaming her connection for an RLS refusal. A "Recargar" is offered
// only where reloading genuinely tells her something new — it never
// brings the edit back, so it must not read as a retry that failed
// silently.
//
// `dataWarning` is a READ problem: the load failed or came back partial.
// Nothing was being saved, so "no se pudo guardar" would be a lie. It
// persists with a retry too, because the app is showing her less than
// she has until she reloads.
//
// Both are keyed, so a failure that repeats replaces its own toast
// instead of stacking persistent copies she has to dismiss one by one.
//
// Both are also recorded to the local diagnostics log before the context
// clears them: what she sees stays calm Spanish, while the real message
// survives for Ajustes → Diagnóstico. Nothing is transmitted.
export function DataErrorToast() {
  const { error, clearError, dataWarning, refreshAll } = useApp();
  const { showToast } = useToast();

  useEffect(() => {
    if (!error) return;
    recordEvent("write", "guardar", error);
    const failure = describeWriteError(error);
    showToast(failure.message, "error", {
      persistent: true,
      key: "write-error",
      ...(failure.canReload ? { actionLabel: "Recargar", onRetry: () => void refreshAll() } : {})
    });
    clearError();
  }, [error, showToast, clearError, refreshAll]);

  useEffect(() => {
    if (!dataWarning) return;
    // A read failure carries the server's message; a partial read has no
    // error of its own, so the Spanish summary IS the finding.
    recordEvent(
      dataWarning.kind === "read" ? "read" : "partial",
      "cargar",
      dataWarning.detail ?? dataWarning.message
    );
    showToast(dataWarning.message, dataWarning.kind === "read" ? "error" : "warning", {
      persistent: true,
      key: "data-warning",
      actionLabel: "Recargar",
      onRetry: () => void refreshAll()
    });
  }, [dataWarning, showToast, refreshAll]);

  return null;
}
