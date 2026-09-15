import { useEffect } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";

// Surfaces a rejected write (already reverted by useCloudStore) as an
// error toast so a failed save is never silent.
export function DataErrorToast() {
  const { error, clearError } = useApp();
  const { showToast } = useToast();

  useEffect(() => {
    if (!error) return;
    showToast("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.", "error");
    clearError();
  }, [error, showToast, clearError]);

  return null;
}
