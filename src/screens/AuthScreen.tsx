import { useState, type FormEvent } from "react";
import type { AuthState } from "../hooks/useAuth";
import { SegmentedControl } from "../components/SegmentedControl";
import { translateError } from "../lib/authErrors";

type Mode = "signin" | "signup" | "magic" | "reset";

/* Angus is a two-person tool. This field keeps a curious visitor from
   filling her database by accident; it is NOT the security boundary —
   it ships in the bundle, and anyone can call supabase.auth.signUp
   directly. The boundary is the allowlist trigger in migration 017,
   which rejects an address that isn't listed whichever door it uses.
   Unset (local dev) = no code required. */
const INVITE_CODE = (import.meta.env.VITE_INVITE_CODE ?? "").trim();

const AUTH_TABS = [
  { k: "signin", l: "Entrar" },
  { k: "signup", l: "Crear cuenta" }
];

export function AuthScreen({ auth }: { auth: AuthState }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const needsPassword = mode === "signin" || mode === "signup";
  const needsInvite = mode === "signup" && INVITE_CODE.length > 0;
  const canSubmit =
    email.trim().length > 3 &&
    (!needsPassword || password.length >= 8) &&
    (!needsInvite || invite.trim().length > 0);

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
      if (needsInvite && invite.trim() !== INVITE_CODE) {
        setError("Ese código de invitación no es correcto.");
        setBusy(false);
        return;
      }
      err = await auth.signUp(addr, password);
      if (!err) setNotice("Cuenta creada. Ya puedes entrar.");
    } else if (mode === "reset") {
      err = await auth.sendPasswordReset(addr);
      if (!err) setNotice("Si ese correo tiene cuenta, te enviamos un enlace para crear una contraseña nueva.");
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
        <div className="auth-tagline">Tu obra, contactos y agenda en un solo lugar.</div>
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

          {needsPassword && (
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

          {needsInvite && (
            <div className="input-group">
              <label className="input-label" htmlFor="auth-invite">
                Código de invitación
              </label>
              <input
                id="auth-invite"
                className="input"
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
              />
              <div className="input-help">Angus es por invitación. Pídele el código a Diego.</div>
            </div>
          )}

          <div className={`input-error-msg ${error ? "is-visible" : ""}`} role="alert">
            {error}
          </div>
          {notice && <div className="auth-notice">{notice}</div>}

          <button className="btn btn-primary" type="submit" disabled={!canSubmit || busy}>
            {busy
              ? "Un momento…"
              : mode === "signin"
                ? "Entrar"
                : mode === "signup"
                  ? "Crear cuenta"
                  : mode === "reset"
                    ? "Enviar enlace de recuperación"
                    : "Enviar enlace"}
          </button>
        </form>

        <button
          className="btn btn-ghost auth-alt"
          type="button"
          onClick={() => {
            setMode(mode === "signin" || mode === "signup" ? "magic" : "signin");
            setError(null);
            setNotice(null);
          }}
        >
          {mode === "signin" || mode === "signup" ? "Entrar con enlace por correo" : "Usar contraseña"}
        </button>

        {mode === "signin" && (
          <button
            className="btn btn-ghost auth-alt"
            type="button"
            onClick={() => {
              setMode("reset");
              setError(null);
              setNotice(null);
            }}
          >
            ¿Olvidaste tu contraseña?
          </button>
        )}
      </div>
    </div>
  );
}

