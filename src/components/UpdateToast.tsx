import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useToast } from "../context/ToastContext";

/* ── UpdateToast ──
   The service worker is registered in "prompt" mode, so a new deploy
   waits until she says so — a reload mid-edit would lose a sheet. The
   toast stays until tapped (persistent) and is keyed so a second
   "waiting" event replaces it instead of stacking. The registration is
   re-checked hourly: a PWA left open on the home screen otherwise
   never sees the next version. */

const CHECK_EVERY_MS = 60 * 60 * 1000;

export function UpdateToast() {
  const { showToast } = useToast();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => void registration.update(), CHECK_EVERY_MS);
    }
  });

  useEffect(() => {
    if (!needRefresh) return;
    showToast("Hay una versión nueva de Angus.", "info", {
      persistent: true,
      key: "sw-update",
      actionLabel: "Actualizar",
      onRetry: () => void updateServiceWorker(true)
    });
  }, [needRefresh, showToast, updateServiceWorker]);

  return null;
}
