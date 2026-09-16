/* Keyboard / naming logic behind the accessibility pass on the shared
   form controls. Everything asserted here is pure — the components
   themselves need a DOM, which this suite (environment: "node") does
   not have, so the arithmetic lives in exported helpers instead of
   inline in the JSX. */
import { describe, it, expect } from "vitest";
import { nextSegmentIndex, segmentTabIndex } from "../segmentedKeys";
import { taskAccessibleName, tokenizeLine, renderLineHTML } from "../markdownModel";

describe("nextSegmentIndex — radiogroup arrow keys", () => {
  it("moves forward on Right and Down", () => {
    expect(nextSegmentIndex("ArrowRight", 0, 4)).toBe(1);
    expect(nextSegmentIndex("ArrowDown", 0, 4)).toBe(1);
  });

  it("moves backward on Left and Up", () => {
    expect(nextSegmentIndex("ArrowLeft", 2, 4)).toBe(1);
    expect(nextSegmentIndex("ArrowUp", 2, 4)).toBe(1);
  });

  it("wraps at both ends", () => {
    expect(nextSegmentIndex("ArrowRight", 3, 4)).toBe(0);
    expect(nextSegmentIndex("ArrowLeft", 0, 4)).toBe(3);
  });

  it("jumps to the ends on Home / End", () => {
    expect(nextSegmentIndex("Home", 2, 4)).toBe(0);
    expect(nextSegmentIndex("End", 1, 4)).toBe(3);
  });

  it("ignores keys that are not ours", () => {
    expect(nextSegmentIndex("Enter", 1, 4)).toBeNull();
    expect(nextSegmentIndex(" ", 1, 4)).toBeNull();
    expect(nextSegmentIndex("Tab", 1, 4)).toBeNull();
    expect(nextSegmentIndex("a", 1, 4)).toBeNull();
  });

  it("treats an unmatched selection as sitting on the first option", () => {
    // value not in items → activeIndex is -1; the first arrow press
    // must still land somewhere real rather than on index -2.
    expect(nextSegmentIndex("ArrowRight", -1, 3)).toBe(1);
    expect(nextSegmentIndex("ArrowLeft", -1, 3)).toBe(2);
  });

  it("never indexes an empty group", () => {
    expect(nextSegmentIndex("ArrowRight", 0, 0)).toBeNull();
  });

  it("stays in range for a single-option group", () => {
    expect(nextSegmentIndex("ArrowRight", 0, 1)).toBe(0);
    expect(nextSegmentIndex("ArrowLeft", 0, 1)).toBe(0);
  });
});

describe("segmentTabIndex — roving tabindex", () => {
  it("puts only the checked option in the tab order", () => {
    expect(segmentTabIndex(0, 2)).toBe(-1);
    expect(segmentTabIndex(1, 2)).toBe(-1);
    expect(segmentTabIndex(2, 2)).toBe(0);
  });

  it("falls back to the first option when nothing is checked", () => {
    // Otherwise a group with no selection is unreachable by Tab.
    expect(segmentTabIndex(0, -1)).toBe(0);
    expect(segmentTabIndex(1, -1)).toBe(-1);
  });

  it("exposes exactly one tab stop", () => {
    const count = 5;
    for (const active of [-1, 0, 3, 4]) {
      const stops = Array.from({ length: count }, (_, i) => segmentTabIndex(i, active)).filter(t => t === 0);
      expect(stops).toHaveLength(1);
    }
  });
});

describe("taskAccessibleName — naming the tarea checkbox", () => {
  it("uses the line's prose", () => {
    expect(taskAccessibleName(tokenizeLine("[ ] Comprar bastidores"))).toBe("Comprar bastidores");
  });

  it("strips inline markdown so the name matches what is read", () => {
    expect(taskAccessibleName(tokenizeLine("[x] **Entregar** la ~~pieza~~"))).toBe("Entregar la pieza");
  });

  it("never returns an empty name", () => {
    expect(taskAccessibleName(tokenizeLine("[ ] "))).toBe("Tarea sin texto");
    expect(taskAccessibleName(tokenizeLine("[ ]    "))).toBe("Tarea sin texto");
  });

  it("caps a paragraph-long tarea", () => {
    const long = "a".repeat(200);
    const name = taskAccessibleName(tokenizeLine(`[ ] ${long}`));
    expect(name).toHaveLength(81); // 80 chars + the ellipsis
    expect(name.endsWith("…")).toBe(true);
  });

  it("escapes into the rendered attribute", () => {
    const html = renderLineHTML(tokenizeLine('[ ] "comillas" & <tags>'));
    expect(html).not.toContain('aria-label=""comillas"');
    expect(html).toContain("&quot;comillas&quot; &amp; &lt;tags&gt;");
  });
});
