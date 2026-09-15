import { useState, useEffect, useCallback } from "react";

/* ── useTheme ──
   Port of Cardigan's hooks/useTheme.ts (minus the native status-bar
   call). dark.css only redefines tokens under html[data-theme="dark"],
   so SOMETHING has to stamp that attribute: this hook resolves the
   stored preference ("light" | "dark" | "system") against the OS
   prefers-color-scheme and applies it to <html>. */

const LS_KEY = "angus-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function getStored() {
  try { return localStorage.getItem(LS_KEY); } catch { return null; }
}

function apply(resolved: string) {
  if (resolved === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
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
