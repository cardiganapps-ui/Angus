/* The comparison behind the unsaved-changes guard. Every case here is a
   way the guard can lie: a false negative throws her typing away on a
   mis-swipe, a false positive asks "¿descartar?" over a form she never
   touched until she stops reading the question. */
import { describe, it, expect } from "vitest";
import { changedFields, isDirty, valuesEqual } from "../dirty";

describe("valuesEqual — one field", () => {
  it("treats null, undefined and empty string as the same nothing", () => {
    // Sheets seed from `entity?.notes ?? ""` and save `notes.trim()`,
    // so how a blank arrived must not decide whether it changed.
    expect(valuesEqual(null, "")).toBe(true);
    expect(valuesEqual(undefined, "")).toBe(true);
    expect(valuesEqual(null, undefined)).toBe(true);
    expect(valuesEqual("", "   ")).toBe(true);
  });

  it("compares strings trimmed, because trimmed is what gets written", () => {
    expect(valuesEqual("Retrato", " Retrato ")).toBe(true);
    expect(valuesEqual("Retrato", "Retratos")).toBe(false);
  });

  it("does not confuse an empty string with zero or false", () => {
    expect(valuesEqual("", 0)).toBe(false);
    expect(valuesEqual("", false)).toBe(false);
    expect(valuesEqual(null, 0)).toBe(false);
  });

  it("keeps a number apart from its string form", () => {
    // Money lives in state as a string; a sheet that mixed the two
    // would report an untouched amount as edited.
    expect(valuesEqual(1500, "1500")).toBe(false);
  });

  it("reads a list as a selection, not a sequence", () => {
    // Toggling Monday off and back on lands it at the end of weekdays.
    expect(valuesEqual([1, 3], [3, 1])).toBe(true);
    expect(valuesEqual([1, 3], [1, 3, 5])).toBe(false);
    expect(valuesEqual([1, 3], [1, 4])).toBe(false);
    expect(valuesEqual([], [])).toBe(true);
  });

  it("does not collapse 1 and \"1\" inside a list", () => {
    expect(valuesEqual([1], ["1"])).toBe(false);
  });

  it("never calls a list equal to a scalar", () => {
    expect(valuesEqual([], "")).toBe(false);
    expect(valuesEqual([1], 1)).toBe(false);
  });

  it("distinguishes the two booleans", () => {
    expect(valuesEqual(true, false)).toBe(false);
    expect(valuesEqual(false, false)).toBe(true);
  });
});

describe("isDirty — a whole form", () => {
  const opened = {
    title: "Retrato",
    amount: "1500",
    notes: "",
    contactId: null,
    weekdays: [1, 3] as readonly number[],
    status: "idea"
  };

  it("is clean when nothing moved", () => {
    expect(isDirty(opened, { ...opened })).toBe(false);
  });

  it("is clean when only the noise moved", () => {
    // Re-seeded blanks, a trailing space, the weekday chips reordered.
    expect(
      isDirty(opened, { ...opened, notes: "  ", contactId: "", title: "Retrato ", weekdays: [3, 1] })
    ).toBe(false);
  });

  it("catches a single typed character", () => {
    expect(isDirty(opened, { ...opened, title: "Retratos" })).toBe(true);
  });

  it("catches a picker that went from nothing to something", () => {
    expect(isDirty(opened, { ...opened, contactId: "c1" })).toBe(true);
  });

  it("catches a field that was cleared", () => {
    expect(isDirty(opened, { ...opened, amount: "" })).toBe(true);
  });

  it("catches a chip that was added", () => {
    expect(isDirty(opened, { ...opened, weekdays: [1, 3, 5] })).toBe(true);
  });

  it("compares a key missing on one side against empty, not against nothing", () => {
    // A field that only renders in one branch must not be a blind spot.
    expect(isDirty({ a: "x" }, {})).toBe(true);
    expect(isDirty({}, { a: "x" })).toBe(true);
    expect(isDirty({ a: "" }, {})).toBe(false);
    expect(isDirty({ a: null }, {})).toBe(false);
  });
});

describe("changedFields", () => {
  it("names every field that moved, sorted", () => {
    expect(changedFields({ b: "1", a: "1", c: "1" }, { b: "2", a: "1", c: "3" })).toEqual(["b", "c"]);
  });

  it("is empty for a clean form", () => {
    expect(changedFields({ a: " x ", b: null }, { a: "x", b: "" })).toEqual([]);
  });

  it("agrees with isDirty", () => {
    const opened = { a: "1", b: [1, 2] as readonly number[] };
    const current = { a: "1", b: [2, 1] as readonly number[] };
    expect(changedFields(opened, current).length > 0).toBe(isDirty(opened, current));
  });
});
