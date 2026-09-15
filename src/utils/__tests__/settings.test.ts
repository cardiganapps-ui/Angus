import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, firstName, mergeSettings, suggestMediums } from "../settings";

describe("mergeSettings", () => {
  it("returns the defaults for an empty or malformed blob", () => {
    expect(mergeSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings("nope")).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings([1, 2])).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid values and drops unknown keys", () => {
    const merged = mergeSettings({
      artistName: "  Andrea ",
      practice: ["classes", "pieces"],
      mediums: ["Óleo", "Óleo", " Cerámica "],
      monthlyIncomeGoal: 25000,
      theme: "dark",
      somethingElse: true
    });
    expect(merged.artistName).toBe("Andrea");
    expect(merged.practice).toEqual(["classes", "pieces"]);
    expect(merged.mediums).toEqual(["Óleo", "Cerámica"]);
    expect(merged.monthlyIncomeGoal).toBe(25000);
    expect(merged.theme).toBe("dark");
    expect("somethingElse" in merged).toBe(false);
  });

  it("falls back per key when a value has the wrong type or is out of range", () => {
    const merged = mergeSettings({
      practice: ["classes", "juggling", 3],
      monthlyIncomeGoal: -5,
      defaultDepositPercent: 150,
      defaultPaymentMethod: "crypto",
      textScale: "xl",
      quickActions: ["sale", "nonsense"]
    });
    expect(merged.practice).toEqual(["classes"]);
    expect(merged.monthlyIncomeGoal).toBeNull();
    expect(merged.defaultDepositPercent).toBe(50);
    expect(merged.defaultPaymentMethod).toBe("transfer");
    expect(merged.textScale).toBe("md");
    expect(merged.quickActions).toEqual(["sale"]);
  });

  it("only keeps positive budgets for known categories", () => {
    const merged = mergeSettings({
      budgets: { materials: 1200, studio: 0, transport: "300", ghosts: 50 }
    });
    expect(merged.budgets).toEqual({ materials: 1200 });
  });

  it("rounds a fractional deposit percent", () => {
    expect(mergeSettings({ defaultDepositPercent: 33.4 }).defaultDepositPercent).toBe(33);
  });
});

describe("firstName", () => {
  it("takes the first word", () => {
    expect(firstName("Andrea Garza Hugues")).toBe("Andrea");
    expect(firstName("  Andrea ")).toBe("Andrea");
    expect(firstName("")).toBe("");
  });
});

describe("suggestMediums", () => {
  it("lists distinct mediums, most used first, capitalized", () => {
    const projects = [
      { medium: "óleo" },
      { medium: "Cerámica" },
      { medium: "óleo" },
      { medium: "" },
      { medium: "acuarela" }
    ];
    expect(suggestMediums(projects)).toEqual(["Óleo", "Acuarela", "Cerámica"]);
  });
});
