import { beforeEach, describe, expect, it } from "vitest";
import type { DiagnosticsStore } from "../../lib/diagnostics";
import {
  USAGE_KEY,
  clearUsage,
  countVisit,
  rankRoutes,
  readUsage,
  recordVisit,
  resetForTests,
  untouched,
  type Usage
} from "../../lib/usage";

function fakeStore(initial: Record<string, string> = {}, fail = false): DiagnosticsStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem(k) {
      if (fail) throw new Error("blocked");
      return data[k] ?? null;
    },
    setItem(k, v) {
      if (fail) throw new Error("blocked");
      data[k] = v;
    },
    removeItem(k) {
      if (fail) throw new Error("blocked");
      delete data[k];
    }
  };
}

const NOW = "2026-09-16T10:00:00.000Z";
const usage = (counts: Record<string, number> = {}): Usage => ({ since: NOW, counts });

beforeEach(() => resetForTests());

describe("countVisit", () => {
  it("starts a route at one and increments after", () => {
    const once = countVisit(usage(), "home");
    expect(once.counts.home).toBe(1);
    expect(countVisit(once, "home").counts.home).toBe(2);
  });

  it("keeps the window start and does not mutate its input", () => {
    const before = usage({ home: 1 });
    const after = countVisit(before, "money");
    expect(after.since).toBe(NOW);
    expect(before.counts).toEqual({ home: 1 });
    expect(after.counts).toEqual({ home: 1, money: 1 });
  });
});

describe("rankRoutes", () => {
  it("orders busiest first, ties alphabetical", () => {
    const ranked = rankRoutes(usage({ money: 37, home: 84, notes: 4, schedule: 4 }));
    expect(ranked).toEqual([
      { route: "home", visits: 84 },
      { route: "money", visits: 37 },
      { route: "notes", visits: 4 },
      { route: "schedule", visits: 4 }
    ]);
  });

  it("is empty for a fresh tally", () => {
    expect(rankRoutes(usage())).toEqual([]);
  });
});

describe("untouched", () => {
  /* The half of the gate that says what to DEPRIORITISE: a screen she
     never opened in two weeks is not where the next effort goes. */
  it("lists the routes never opened, in the order given", () => {
    const all = ["home", "schedule", "money", "reports", "forecast"] as const;
    expect(untouched(usage({ home: 12, money: 3 }), all)).toEqual(["schedule", "reports", "forecast"]);
  });

  it("treats a recorded zero as untouched", () => {
    expect(untouched(usage({ reports: 0 }), ["reports"])).toEqual(["reports"]);
  });
});

describe("recordVisit / readUsage", () => {
  it("persists and reads back across a reload", () => {
    const store = fakeStore();
    recordVisit("home", NOW, store);
    recordVisit("home", NOW, store);
    recordVisit("money", NOW, store);
    resetForTests();
    expect(readUsage(NOW, store).counts).toEqual({ home: 2, money: 1 });
  });

  it("keeps the original window across a reload", () => {
    const store = fakeStore();
    recordVisit("home", NOW, store);
    resetForTests();
    expect(readUsage("2026-10-01T00:00:00.000Z", store).since).toBe(NOW);
  });

  it("degrades to memory when the store throws", () => {
    const store = fakeStore({}, true);
    expect(() => recordVisit("home", NOW, store)).not.toThrow();
    expect(readUsage(NOW, store).counts).toEqual({ home: 1 });
  });

  it("works with no store at all", () => {
    expect(() => recordVisit("notes", NOW, null)).not.toThrow();
    expect(readUsage(NOW, null).counts).toEqual({ notes: 1 });
  });

  it("discards a corrupt tally instead of crashing a render", () => {
    expect(readUsage(NOW, fakeStore({ [USAGE_KEY]: "{oops" })).counts).toEqual({});
    resetForTests();
    // Right shape, wrong value types.
    expect(readUsage(NOW, fakeStore({ [USAGE_KEY]: '{"since":"x","counts":{"home":"lots"}}' })).counts).toEqual({});
  });

  it("clears the tally and restarts the window", () => {
    const store = fakeStore();
    recordVisit("home", NOW, store);
    clearUsage("2026-10-01T00:00:00.000Z", store);
    expect(store.data[USAGE_KEY]).toBeUndefined();
    const after = readUsage(NOW, store);
    expect(after.counts).toEqual({});
    expect(after.since).toBe("2026-10-01T00:00:00.000Z");
  });
});
