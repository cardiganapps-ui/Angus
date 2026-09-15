/* ── Haptic feedback helpers ──
   Web-only port of Cardigan's utils/haptics.ts: navigator.vibrate on
   Android Chrome / Samsung Internet; iOS Safari is a silent no-op
   (Apple never shipped the Web Vibration API). Keep patterns short. */

type HapticKind = "tap" | "success" | "warn";

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  success: [10, 40, 12],
  warn: [16, 50, 16],
};

function run(kind: HapticKind) {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;
  try { navigator.vibrate(PATTERNS[kind]); } catch { /* ignore */ }
}

export const haptic = {
  tap: () => run("tap"),
  success: () => run("success"),
  warn: () => run("warn"),
};
