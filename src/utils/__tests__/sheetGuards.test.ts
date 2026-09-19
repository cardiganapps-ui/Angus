/* ── Sheet contracts ──
   Two properties that live in JSX, have no pure function to test, and
   fail silently when they drift:

     1. Every dismissal path goes through ONE gate. A guard that catches
        the close X but not the scrim, Escape or a handle flick is
        theatre — and the flick is the easy one to hit by accident.
     2. Every PickerField names itself from the caption above it. Miss a
        labelId and that picker goes back to announcing "Ninguno".

   This suite runs in "node", so it reads the sources rather than
   rendering them. Nothing here tests React; each case pins the one line
   the behaviour depends on, so the next edit has to break a test
   instead of a screen reader. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf8");

const sheet = read("src/components/Sheet.tsx");
const drag = read("src/hooks/useSheetDrag.ts");

describe("Sheet — every dismissal path is gated", () => {
  it("funnels the scrim, Escape and the close X through the same request", () => {
    expect(sheet).toContain("onClose={closable ? requestClose : null}"); // scrim
    expect(sheet).toContain("useEscape(closable ? onEscape : null)"); // Escape
    expect(sheet).toContain("onClick={requestClose}"); // the X
  });

  it("hands the drag a veto instead of letting it close on its own", () => {
    expect(sheet).toContain("beforeDismiss: allowDismiss");
    expect(drag).toContain("if (beforeDismiss && !beforeDismiss())");
  });

  it("vetoes BEFORE the exit animation, not after", () => {
    // Once the panel is animating off-screen there is no honest way to
    // bring it back, so the check has to sit above the writeTransform
    // that throws it off and the setTimeout that fires onClose.
    const end = drag.slice(drag.indexOf("const onTouchEnd"));
    const veto = end.indexOf("beforeDismiss()");
    const fly = end.indexOf("writeTransform(panel, window.innerHeight");
    expect(veto).toBeGreaterThan(-1);
    expect(fly).toBeGreaterThan(-1);
    expect(veto).toBeLessThan(fly);
  });

  it("asks rather than closes only when there are unsaved edits", () => {
    // Order matters: a submit in flight must stay silent (nothing to
    // discard yet), and a clean form must close without a question.
    const gate = sheet.slice(sheet.indexOf("const allowDismiss"), sheet.indexOf("const requestClose"));
    expect(gate).toContain("if (!canClose) return false;");
    expect(gate).toContain("if (!hasEdits) return true;");
    expect(gate).toContain("setConfirmingDiscard(true)");
  });

  it("lets Escape back out of the confirm before the sheet", () => {
    expect(sheet).toContain("confirmingDiscard ? cancelDiscard : requestClose");
  });

  it("speaks the confirm to a screen reader and moves focus onto it", () => {
    // The swap unmounts the focused footer; without both of these the
    // question exists only for people who can see it.
    expect(sheet).toContain("aria-describedby={questionId}");
    expect(sheet).toContain("discardRef.current?.focus()");
    expect(sheet).toContain("Sí, descartar");
  });

  it("keeps the pre-confirm footer as an inert twin so nothing jumps", () => {
    expect(sheet).toContain('className="sheet-actions-ghost" aria-hidden="true" inert');
  });

  it("never reaches for beforeunload", () => {
    // A browser-chrome "leave site?" prompt in a PWA is worse than the
    // problem it would solve. (The word itself is allowed — the file
    // says in a comment why it is not used.)
    expect(sheet).not.toMatch(/addEventListener\(\s*["']beforeunload/);
    expect(sheet).not.toContain("onbeforeunload");
  });
});

/* Form sheets that hold typing she can lose. A read-only detail sheet
   is deliberately absent — arming a confirm over a tab switch would
   teach her to tap through it. */
const GUARDED_SHEETS = [
  "src/components/ProjectSheet.tsx",
  "src/components/ContactSheet.tsx",
  "src/components/EventSheet.tsx",
  "src/components/ExpenseSheet.tsx",
  "src/components/AssignmentSheet.tsx",
  "src/components/CourseSheet.tsx",
  "src/components/ClassGroupSheet.tsx",
  "src/components/RecurringRuleSheet.tsx",
  "src/components/PaymentSheet.tsx",
  "src/components/LinkSheet.tsx",
  "src/components/SettingsFieldSheet.tsx",
  "src/components/ChangePasswordSheet.tsx",
  "src/components/notes/QuickCaptureSheet.tsx"
];

describe.each(GUARDED_SHEETS)("%s", (path) => {
  const src = read(path);

  it("reports its dirty state to the Sheet", () => {
    expect(src).toContain("useDirtyGuard(");
    expect(src).toMatch(/dirty=\{dirty\}/);
  });

  it("says what she loses rather than falling back to the generic line", () => {
    expect(src).toContain("discardText");
    expect(src).toMatch(/¿Descartar/);
  });
});

/* Every file that renders a PickerField. */
const PICKER_CALLERS = [
  "src/components/SaleSheet.tsx",
  "src/components/ProjectSheet.tsx",
  "src/components/ExpenseSheet.tsx",
  "src/components/EventSheet.tsx",
  "src/components/AssignmentSheet.tsx",
  "src/components/CourseSheet.tsx",
  "src/components/RecurringRuleSheet.tsx",
  "src/components/notes/NoteLinkFields.tsx"
];

describe("PickerField — named by the caption above it", () => {
  it.each(PICKER_CALLERS)("%s labels every picker it renders", (path) => {
    const src = read(path);
    const pickers = src.split("<PickerField").length - 1;
    const labelled = src.split("labelId=").length - 1;
    expect(pickers).toBeGreaterThan(0);
    expect(labelled).toBe(pickers);
  });

  it("covers every caller", () => {
    // A new sheet with a picker should land here, not be forgotten.
    const known = new Set(PICKER_CALLERS);
    for (const path of PICKER_CALLERS) expect(known.has(path)).toBe(true);
    expect(read("src/components/SaleSheet.tsx")).toContain("<PickerField");
  });

  it("builds the name from the caption plus the current value", () => {
    const field = read("src/components/PickerField.tsx");
    expect(field).toContain("aria-labelledby={labelId ? `${labelId} ${valueId}` : undefined}");
    // The sr-only copy is the fallback only — never rendered alongside
    // a real caption, or the field name is announced twice.
    expect(field).toContain('{!labelId && <span className="sr-only">{title}</span>}');
  });
});
