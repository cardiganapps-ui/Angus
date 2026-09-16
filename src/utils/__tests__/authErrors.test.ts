import { describe, expect, it } from "vitest";
import { translateError } from "../../lib/authErrors";

/* These strings are not ours — they are GoTrue's, and the mapping is the
   only thing between them and the one screen a locked-out person sees.
   Every case below was read off the live endpoint, not from the docs:
   GoTrue does not pass a trigger's own message through, so the allowlist
   refusal arrives as a flat "Database error saving new user". */

describe("translateError", () => {
  it("names the real reason for a blocked signup", () => {
    for (const raw of [
      "Database error saving new user",
      "signup_not_allowed",
      "Signups not allowed for this instance"
    ]) {
      expect(translateError(raw)).toMatch(/invitaci[óo]n|cuenta con ese correo/i);
    }
  });

  it("never blames her connection for a rule", () => {
    const connection = translateError("something we have never seen");
    expect(connection).toMatch(/conexión/);
    expect(translateError("Database error saving new user")).not.toBe(connection);
  });

  it("translates the everyday failures", () => {
    expect(translateError("Invalid login credentials")).toMatch(/incorrectos/);
    expect(translateError("User already registered")).toMatch(/ya tiene cuenta/);
    expect(translateError("Email rate limit exceeded")).toMatch(/Demasiados intentos/);
  });

  it("answers in Spanish whatever it is handed", () => {
    for (const raw of ["", "ECONNRESET", "500 Internal Server Error", "Invalid login credentials"]) {
      const out = translateError(raw);
      expect(out.length).toBeGreaterThan(0);
      expect(out).not.toBe(raw);
      expect(/[a-z]/i.test(out)).toBe(true);
    }
  });
});
