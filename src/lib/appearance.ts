import type { TextScale } from "../types";

/* base.css multiplies every --text-* token by --text-scale-user, so one
   custom property on <html> resizes the whole app without touching a
   single component. */
const SCALE: Record<TextScale, string> = { sm: "0.93", md: "1", lg: "1.1" };

export function applyTextScale(scale: TextScale) {
  document.documentElement.style.setProperty("--text-scale-user", SCALE[scale]);
}
