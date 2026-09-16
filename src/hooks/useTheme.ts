import { useState, useEffect, useCallback } from "react";

/* ── useTheme ──
   Port of Cardigan's hooks/useTheme.ts (minus the native status-bar
   call). dark.css only redefines tokens under html[data-theme="dark"],
   so SOMETHING has to stamp that attribute: this hook resolves the
   stored preference ("light" | "dark" | "system") against the OS
   prefers-color-scheme and applies it to <html>.

   index.html carries a blocking copy of the same resolution so the
   attribute is already correct at first paint. Keep the two in step —
   same LS_KEY, same values, same DOM writes — or a dark cold start
   flashes white again. */

const LS_KEY = "angus-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function getStored() {
  try { return localStorage.getItem(LS_KEY); } catch { return null; }
}

function apply(resolved: string) {
  // Stamp the RESOLVED theme both ways, never remove the attribute: the
  // light branch used to leave <html> bare, so base.css's
  // `html[data-theme="light"]` rule was unreachable and a user who picked
  // Claro on a dark OS still got `color-scheme: dark` + the dark html
  // background from the prefers-color-scheme block. This also matches the
  // blocking script in index.html, so mount can't flip anything.
  document.documentElement.setAttribute("data-theme", resolved === "dark" ? "dark" : "light");
  // index.html carries TWO media-scoped theme-color metas (light +
  // dark). Update both so an explicit user pick beats the OS one.
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => { meta.content = resolved === "dark" ? "#1A1620" : "#FFFFFF"; });
}

export function useTheme() {
  const [preference, setPreferenceState] = useState(() => getStored() || "system");
  const [systemIsDark, setSystemIsDark] = useState(() => window.matchMedia(DARK_QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(DARK_QUERY);
    const handler = () => setSystemIsDark(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const resolvedTheme = preference === "dark" ? "dark"
    : preference === "light" ? "light"
    : systemIsDark ? "dark" : "light";

  useEffect(() => { apply(resolvedTheme); }, [resolvedTheme]);

  const setPreference = useCallback((value: string) => {
    try { localStorage.setItem(LS_KEY, value); } catch { /* private mode / quota — non-fatal */ }
    setPreferenceState(value);
  }, []);

  return { preference, resolvedTheme, setPreference };
}
