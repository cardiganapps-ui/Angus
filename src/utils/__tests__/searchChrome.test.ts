import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/* ── Global search: the parts that aren't a pure function ──
   The entry point, the combobox wiring and the token discipline all live
   in JSX and CSS, where nothing can render them in this suite ("node",
   no DOM). Same approach as styleContracts.test.ts: pin the one line
   each behaviour depends on, so the next edit breaks a test instead of
   breaking the only way she has to find anything. */

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf8");

const app = read("src/App.tsx");
const sheet = read("src/components/GlobalSearchSheet.tsx");
const css = read("src/styles/search.css");

describe("the entry point", () => {
  it("sits in the top bar, which is the only chrome on every route", () => {
    expect(app).toContain('className="topbar-search"');
    expect(app).toContain('aria-label="Buscar"');
    expect(app).toContain("setSearchOpen(true)");
  });

  it("stays off the entry chunk", () => {
    // It reaches into every entity, so it pulls in every detail sheet.
    expect(app).toMatch(/const GlobalSearchSheet = lazy\(/);
  });

  it("carries its own class, because the rail hides the hamburger's", () => {
    // drawer.css: `.shell--rail .topbar-menu { display: none }` — reusing
    // that class would delete search on every desktop.
    expect(css).toContain(".topbar-search {");
    expect(app.slice(app.indexOf('className="topbar-search"'))).not.toContain("topbar-menu");
  });
});

describe("the sheet's accessibility wiring", () => {
  it("gives the field a real label, not just a placeholder", () => {
    expect(sheet).toContain('htmlFor="gsearch-input"');
    expect(sheet).toContain('id="gsearch-input"');
  });

  it("is a combobox over a listbox, so the caret never leaves the field", () => {
    expect(sheet).toContain('role="combobox"');
    expect(sheet).toContain('aria-controls="gsearch-results"');
    expect(sheet).toContain("aria-activedescendant={active >= 0 ? optionId(active) : undefined}");
    expect(sheet).toContain('role="listbox"');
    expect(sheet).toContain('role="option"');
    expect(sheet).toContain("aria-selected={isActive}");
  });

  it("announces how many results there are", () => {
    expect(sheet).toContain('role="status"');
    expect(sheet).toContain('aria-live="polite"');
  });

  it("moves focus into the field on open", () => {
    // useLayoutEffect, not useEffect: the sheet's focus trap parks focus
    // on the panel in a rAF unless something inside already holds it.
    expect(sheet).toMatch(/useLayoutEffect\(\(\) => \{[\s\S]*?focus\(\{ preventScroll: true \}\)/);
  });

  it("opens the thing itself — every kind has its own sheet", () => {
    for (const component of [
      "ProjectSheet",
      "ContactDetailSheet",
      "SaleDetailSheet",
      "ExpenseSheet",
      "EventSheet",
      "CourseDetailSheet",
      "AssignmentSheet",
      "ClassGroupDetailSheet",
      "NoteEditor"
    ]) {
      expect(sheet).toContain(`<${component} `);
    }
  });
});

describe("token discipline", () => {
  it("keeps hex literals out of the TSX", () => {
    expect(sheet).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("keeps hex literals, raw env() and raw curves out of the CSS", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/env\(/);
    expect(css).not.toMatch(/cubic-bezier/);
  });

  it("keeps the 16px iOS zoom floor on the input", () => {
    expect(css).toContain("font-size: max(16px, calc(16px * var(--text-scale-user, 1)))");
  });

  it("keeps the topbar button at a 44px hit target", () => {
    const rule = css.slice(css.indexOf(".topbar-search {"), css.indexOf("}", css.indexOf(".topbar-search {")));
    expect(rule).toContain("width: 44px");
    expect(rule).toContain("height: 44px");
  });
});
