/* GoTrue's messages, turned into the one sentence a locked-out person
   reads. Lives apart from AuthScreen so it can be tested directly. */

export function translateError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("email address") && m.includes("invalid")) return "Ese correo no parece válido.";
  if (m.includes("email not confirmed")) return "Confirma tu correo antes de entrar.";
  if (m.includes("already registered")) return "Ese correo ya tiene cuenta. Intenta entrar.";
  /* Raised by public.enforce_signup_allowlist (migration 017). GoTrue
     swallows the exception's own text and answers a flat "Database error
     saving new user", so matching on the raise's message never fires —
     verified against the live endpoint, where a stranger's signup fell
     through to the generic connection copy and blamed her wifi for a
     rule. Both forms are mapped. The wrapped form is technically any
     auth.users trigger failing, but the allowlist is the only `before
     insert` raise, so lead with the invitation and stay true either
     way. */
  if (m.includes("signup_not_allowed") || m.includes("not allowed")) {
    return "Angus es por invitación. Pide que agreguen tu correo.";
  }
  if (m.includes("database error saving new user")) {
    return "No pudimos crear la cuenta. Angus es por invitación — pide que agreguen tu correo.";
  }
  // shouldCreateUser: false — a magic link is a way in, not a way to sign up.
  if (m.includes("signups not allowed") || m.includes("user not found")) {
    return "No encontramos una cuenta con ese correo.";
  }
  if (m.includes("rate limit")) return "Demasiados intentos. Espera un momento.";
  if (m.includes("password")) return "La contraseña debe tener al menos 8 caracteres.";
  return "No se pudo completar. Revisa tu conexión e inténtalo de nuevo.";
}
