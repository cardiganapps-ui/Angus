/* ── Breadcrumbs ──
   The last few things that happened before she tapped the bug: which
   screens she moved through, and anything the page complained about
   (uncaught errors, rejected promises, console.error). Kept in memory
   only — never stored, never transmitted on its own — and attached to a
   report from FeedbackSheet so the reader can retrace her steps.

   MESSAGES ONLY, same rule as lib/diagnostics.ts: a console.error with
   an object argument records "[object]", never the object, because an
   error can quote the row that tripped it. */

export type BreadcrumbKind = "route" | "error" | "rejection" | "console";

export interface Breadcrumb {
  at: string;
  kind: BreadcrumbKind;
  text: string;
}

const MAX = 40;
const MAX_TEXT = 300;
let trail: Breadcrumb[] = [];
let installed = false;

function clip(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > MAX_TEXT ? `${clean.slice(0, MAX_TEXT)}…` : clean;
}

function describe(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (arg === null || arg === undefined) return String(arg);
  if (typeof arg === "number" || typeof arg === "boolean") return String(arg);
  return "[object]";
}

export function recordBreadcrumb(kind: BreadcrumbKind, text: string, now: string = new Date().toISOString()): void {
  const last = trail[trail.length - 1];
  // A route re-rendering or an error repeating should not flood the trail.
  if (last && last.kind === kind && last.text === text) return;
  trail = [...trail, { at: now, kind, text: clip(text) }].slice(-MAX);
}

export function readBreadcrumbs(): Breadcrumb[] {
  return trail;
}

/** Hooks the page's error channels once. Safe to call twice. */
export function installBreadcrumbs(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    recordBreadcrumb("error", e.message || "error");
  });
  window.addEventListener("unhandledrejection", (e) => {
    recordBreadcrumb("rejection", describe(e.reason));
  });
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    recordBreadcrumb("console", args.map(describe).join(" "));
    original(...args);
  };
}

/** Test seam. */
export function resetBreadcrumbsForTests(): void {
  trail = [];
}
