import { useState, type FormEvent } from "react";
import type { AuthState } from "../hooks/useAuth";
import { SegmentedControl } from "../components/SegmentedControl";

type Mode = "signin" | "signup" | "magic";

const AUTH_TABS = [
  { k: "signin", l: "Entrar" },
  { k: "signup", l: "Crear cuenta" }
];

export function AuthScreen({ auth }: { auth: AuthState }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canSubmit = email.trim().length > 3 && (mode === "magic" || password.length >= 8);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const addr = email.trim();
    let err: string | null = null;
    if (mode === "signin") err = await auth.signIn(addr, password);
    else if (mode === "signup") {
      err = await auth.signUp(addr, password);
      if (!err) setNotice("Cuenta creada. Si no entras automáticamente, revisa tu correo para confirmarla.");
    } else {
      err = await auth.sendMagicLink(addr);
      if (!err) setNotice("Te enviamos un enlace. Ábrelo desde este teléfono para entrar.");
    }
    if (err) setError(translateError(err));
    setBusy(false);
  }

  return (
    <div className="page auth-page scroll-bounce">
      <div className="auth-hero">
        <div className="auth-brand">Angus</div>
        <div className="auth-tagline">Tus proyectos, contactos y agenda en un solo lugar.</div>
      </div>

      <div className="card auth-card">
        <SegmentedControl
          items={AUTH_TABS}
          value={mode === "signup" ? "signup" : "signin"}
          onChange={(k) => {
            setMode(k as Mode);
            setError(null);
            setNotice(null);
          }}
          size="md"
          ariaLabel="Entrar o crear cuenta"
          style={{ marginBottom: "var(--space-6)" }}
        />

        <form onSubmit={onSubmit} noValidate>
          <div className="input-group">
            <label className="input-label" htmlFor="auth-email">
              Correo
            </label>
            <input
              id="auth-email"
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>

          {mode !== "magic" && (
            <div className="input-group">
              <label className="input-label" htmlFor="auth-password">
                Contraseña
              </label>
              <input
                id="auth-password"
                className="input"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === "signup" && <div className="input-help">Mínimo 8 caracteres.</div>}
            </div>
          )}

          <div className={`input-error-msg ${error ? "is-visible" : ""}`} role="alert">
            {error}
          </div>
          {notice && <div className="auth-notice">{notice}</div>}

          <button className="btn btn-primary" type="submit" disabled={!canSubmit || busy}>
            {busy ? "Un momento…" : mode === "signin" ? "Entrar" : mode === "signup" ? "Crear cuenta" : "Enviar enlace"}
          </button>
        </form>

        <button
          className="btn btn-ghost auth-alt"
          type="button"
          onClick={() => {
            setMode(mode === "magic" ? "signin" : "magic");
            setError(null);
            setNotice(null);
          }}
        >
          {mode === "magic" ? "Usar contraseña" : "Entrar con enlace por correo"}
        </button>
      </div>
    </div>
  );
}

function translateError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("email address") && m.includes("invalid")) return "Ese correo no parece válido.";
  if (m.includes("email not confirmed")) return "Confirma tu correo antes de entrar.";
  if (m.includes("already registered")) return "Ese correo ya tiene cuenta. Intenta entrar.";
  if (m.includes("rate limit")) return "Demasiados intentos. Espera un momento.";
  if (m.includes("password")) return "La contraseña debe tener al menos 8 caracteres.";
  return "No se pudo completar. Revisa tu conexión e inténtalo de nuevo.";
}
