import { useId, useState } from "react";
import { Sheet } from "./Sheet";
import { useToast } from "../context/ToastContext";
import { useDirtyGuard } from "../hooks/useDirtyGuard";
import { domId } from "../utils/id";
import { haptic } from "../lib/haptics";

const MIN = 8;

export function ChangePasswordSheet({
  updatePassword,
  onClose
}: {
  updatePassword: (password: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const { showSuccess } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = useDirtyGuard({ password, confirm });
  const errorId = `password-error-${domId(useId())}`;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSave = password.length >= MIN && confirm === password && !submitting;

  async function handleSave() {
    if (!canSave) return;
    setSubmitting(true);
    setError(null);
    const err = await updatePassword(password);
    if (err) {
      setError(translate(err));
      setSubmitting(false);
      return;
    }
    haptic.success();
    showSuccess("Contraseña actualizada");
    onClose();
  }

  return (
    <Sheet
      title="Cambiar contraseña"
      onClose={submitting ? null : onClose}
      dirty={dirty}
      discardText="¿Descartar? Tu contraseña no cambia."
      footer={
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!canSave}>
          {submitting ? "Guardando…" : "Guardar"}
        </button>
      }
    >
      <div className="input-group">
        <label className="input-label" htmlFor="new-password">
          Nueva contraseña
        </label>
        <input
          id="new-password"
          className="input"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={error ? errorId : undefined}
          autoFocus
        />
        <div className="input-help">Mínimo {MIN} caracteres.</div>
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="confirm-password">
          Confirmar contraseña
        </label>
        <input
          id="confirm-password"
          className={`input ${mismatch ? "input-error" : ""}`}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatch || undefined}
          aria-describedby={errorId}
        />
      </div>

      {/* One live region for both the mismatch and whatever the server
          said, described by BOTH fields so the reason is reachable
          from the input it belongs to, not only announced once. */}
      <div className={`input-error-msg ${error || mismatch ? "is-visible" : ""}`} id={errorId} role="alert">
        {error ?? (mismatch ? "Las contraseñas no coinciden." : "")}
      </div>
    </Sheet>
  );
}

function translate(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("should be different") || m.includes("same as the old"))
    return "Elige una contraseña distinta a la actual.";
  if (m.includes("password")) return `La contraseña debe tener al menos ${MIN} caracteres.`;
  if (m.includes("session")) return "Tu sesión expiró. Vuelve a entrar e inténtalo de nuevo.";
  return "No se pudo actualizar. Revisa tu conexión e inténtalo de nuevo.";
}
