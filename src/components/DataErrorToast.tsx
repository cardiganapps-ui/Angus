import { useEffect } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";

// Two different failures, two different messages.
//
// `error` is a rejected WRITE — useCloudStore already reverted it, so the
// row she sees is the row the server has, and the only thing left is to
// tell her the save didn't stick.
//
// `dataWarning` is a READ problem: the load failed or came back partial.
// Nothing was being saved, so "no se pudo guardar" would be a lie. It
// persists with a retry instead of auto-dismissing, because the app is
// showing her less than she has until she reloads.
export function DataErrorToast() {
  const { error, clearError, dataWarning, refreshAll } = useApp();
  const { showToast } = useToast();

  useEffect(() => {
    if (!error) return;
    showToast("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.", "error");
    clearError();
  }, [error, showToast, clearError]);

  useEffect(() => {
    if (!dataWarning) return;
    if (dataWarning.detail) console.error("[read]", dataWarning.detail);
    showToast(dataWarning.message, dataWarning.kind === "read" ? "error" : "warning", {
      persistent: true,
      key: "data-warning",
      actionLabel: "Recargar",
      onRetry: () => void refreshAll()
    });
  }, [dataWarning, showToast, refreshAll]);

  return null;
}
