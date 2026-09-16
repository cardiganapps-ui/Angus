import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/* ── Style contracts ──
   Three fixes that live in files no unit can import, and that all fail
   SILENTLY when they drift: the app flashes white on a dark cold start,
   a list sits at opacity 0 for a third of a second, or a sheet stops
   answering the finger for its first half-second. Nothing here tests
   CSS rendering — each case pins the one declaration the fix depends on,
   so the next edit has to break a test instead of a phone in a studio. */

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf8");

const indexHtml = read("index.html");
const useTheme = read("src/hooks/useTheme.ts");
const responsiveCss = read("src/styles/responsive.css");
const componentsCss = read("src/styles/components.css");

describe("blocking theme script", () => {
  const head = indexHtml.slice(0, indexHtml.indexOf("</head>"));

  it("runs inline and synchronously before first paint", () => {
    // A src / defer / async / type=module attribute would push it past
    // first paint, which is the whole bug it exists to prevent.
    const script = head.match(/<script>[\s\S]*?<\/script>/);
    expect(script).not.toBeNull();
    expect(script?.[0]).toContain("data-theme");
  });

  it("reads the same storage key useTheme writes", () => {
    const key = useTheme.match(/const LS_KEY = "([^"]+)"/)?.[1];
    expect(key).toBeTruthy();
    expect(head).toContain(`localStorage.getItem("${key}")`);
  });

  it("resolves the same three preferences, falling back to the OS", () => {
    expect(head).toContain('pref === "dark"');
    expect(head).toContain('pref !== "light"');
    expect(head).toContain("prefers-color-scheme: dark");
  });

  it("stamps data-theme both ways, exactly as useTheme's apply() does", () => {
    // apply() used to REMOVE the attribute on the light branch, leaving
    // base.css's html[data-theme="light"] rule dead — and any mismatch
    // between these two is a second flip the user watches happen.
    expect(useTheme).toContain('setAttribute("data-theme", resolved === "dark" ? "dark" : "light")');
    expect(useTheme).not.toContain("removeAttribute");
    expect(head).toContain('setAttribute("data-theme", dark ? "dark" : "light")');
  });

  it("agrees with useTheme on the two theme-color values", () => {
    for (const color of ["#1A1620", "#FFFFFF"]) {
      expect(useTheme).toContain(color);
      expect(head).toContain(color);
    }
  });

  it("survives storage being blocked", () => {
    // Private mode makes localStorage.getItem throw; an unguarded read
    // would take the app down before React ever loads.
    expect(head).toMatch(/try\s*{\s*pref = localStorage\.getItem\([^)]*\);\s*}\s*catch/);
  });
});

describe("prefers-reduced-motion reset", () => {
  const block = responsiveCss.slice(
    responsiveCss.indexOf("@media (prefers-reduced-motion: reduce)")
  );

  it("zeroes delays, not just durations", () => {
    // Staggered entrances start hidden and space themselves with
    // animation-delay; collapsing only the duration leaves the content
    // invisible for the full delay rather than showing it sooner.
    for (const prop of [
      "animation-duration",
      "animation-iteration-count",
      "animation-delay",
      "transition-duration",
      "transition-delay"
    ]) {
      expect(block).toMatch(new RegExp(`${prop}:[^;]*!important`));
    }
  });

  it("reaches every staggered animation in the app", () => {
    // Both staggers are plain animation-delay declarations, so the
    // universal reset above covers them. A stagger driven some other way
    // (a JS-set inline delay, an !important of its own) would escape it —
    // this is the tripwire for that.
    const staggered = ["src/styles/base.css", "src/styles/charts.css"].map(read).join("\n");
    expect(staggered).toMatch(/animation-delay:/);
    expect(staggered).not.toMatch(/animation-delay:[^;]*!important/);
  });
});

describe("sheet entrance vs. drag-to-dismiss", () => {
  /* useSheetDrag moves the panel with `el.style.transform`, and a running
     CSS animation outranks an inline style — so an entrance that animates
     `transform` swallows the gesture for as long as it plays. The
     entrances animate the independent `translate` / `scale` properties
     instead, which compose with transform rather than replacing it. */
  const framesOf = (name: string) => {
    const start = componentsCss.indexOf(`@keyframes ${name} {`);
    expect(start).toBeGreaterThan(-1);
    return componentsCss.slice(start, componentsCss.indexOf("}", componentsCss.indexOf("{", start + 12)) + 1);
  };

  it("keeps the phone entrance off `transform`", () => {
    const frames = framesOf("sheetRiseIn");
    expect(frames).not.toMatch(/transform:/);
    expect(frames).toMatch(/translate:\s*0\s+100%/);
  });

  it("keeps the tablet/desktop entrance off `transform`", () => {
    const frames = framesOf("sheetScaleIn");
    expect(frames).not.toMatch(/transform:/);
    expect(frames).toMatch(/scale:\s*0\.9/);
  });

  it("still refuses a fill mode on the entrance", () => {
    // `both`/`forwards` would pin the animated property after the run and
    // outrank inline styles forever — the original form of this bug.
    expect(componentsCss).toMatch(/animation: sheetRiseIn 520ms var\(--ease-out\);/);
    expect(componentsCss).not.toMatch(/animation: sheetRiseIn[^;]*(both|forwards)/);
    expect(responsiveCss).not.toMatch(/animation: sheetScaleIn[^;]*(both|forwards)/);
  });

  it("leaves the hook's own transform writes as the only transform on the panel", () => {
    // If a future entrance is added back on transform, drag dies again
    // silently. The panel's own rule must not declare one either.
    const start = componentsCss.indexOf(".sheet-panel {");
    const rule = componentsCss
      .slice(start, componentsCss.indexOf("}", start))
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rule).not.toMatch(/(^|[^-])transform:/);
  });
});
