import { describe, expect, it, vi } from "vitest";

// The pure helpers live beside the hook, and ESM evaluates the whole
// graph on import — which would construct a real Supabase client.
vi.mock("../../lib/supabase", () => ({ supabase: {} }));

import {
  PendingLedger,
  canDiff,
  covers,
  loadPlan,
  makeBreaker,
  mergeLoaded,
  truncationOf,
  type CloudStoreConfig,
  type Entity,
  deadline
} from "../../hooks/useCloudStore";

interface Row {
  id: string;
}
interface Thing extends Entity {
  id: string;
  label?: string;
}

const config = (over: Partial<CloudStoreConfig<Thing, Row>> = {}): CloudStoreConfig<Thing, Row> => ({
  table: "things",
  cap: 100,
  fromRow: (r) => ({ id: r.id }),
  toRow: (t) => ({ id: t.id }),
  ...over
});

const thing = (id: string, label = "a"): Thing => ({ id, label });

describe("loadPlan", () => {
  it("defaults to created_at desc and no span when unwindowed", () => {
    const plan = loadPlan(config(), "2026-09-15", null);
    expect(plan.order).toEqual({ column: "created_at", ascending: false });
    expect(plan.span).toBeNull();
    expect(plan.cap).toBe(100);
  });

  it("honours an explicit order", () => {
    const plan = loadPlan(config({ order: { column: "date", ascending: true } }), "2026-09-15", null);
    expect(plan.order).toEqual({ column: "date", ascending: true });
  });

  it("centres a window on today", () => {
    const plan = loadPlan(config({ window: { column: "date", back: 30, ahead: 10 } }), "2026-09-15", null);
    expect(plan.span).toEqual({ from: "2026-08-16", to: "2026-09-25" });
  });

  it("widens for a requested range and never narrows", () => {
    const windowed = config({ window: { column: "date", back: 30, ahead: 10 } });
    // Asking for something outside the base span widens both ends.
    expect(loadPlan(windowed, "2026-09-15", { from: "2025-01-01", to: "2027-12-31" }).span).toEqual({
      from: "2025-01-01",
      to: "2027-12-31"
    });
    // Asking for something inside it leaves the base span alone.
    expect(loadPlan(windowed, "2026-09-15", { from: "2026-09-01", to: "2026-09-20" }).span).toEqual({
      from: "2026-08-16",
      to: "2026-09-25"
    });
  });

  it("ignores a requested range when the store is unwindowed", () => {
    expect(loadPlan(config(), "2026-09-15", { from: "2020-01-01", to: "2030-01-01" }).span).toBeNull();
  });
});

describe("truncationOf", () => {
  it("is false when the count says we have everything", () => {
    expect(truncationOf(40, 40, 100)).toBe(false);
    expect(truncationOf(0, 0, 100)).toBe(false);
  });

  it("is true when the server holds more than we loaded", () => {
    expect(truncationOf(100, 250, 100)).toBe(true);
  });

  /* The regression that motivated the exact count. `limit + 1` answers
     this wrong whenever db-max-rows < cap: the server returns the cap and
     the read looks complete, so the app claims "all of it" over a
     truncated list — worse than saying nothing. */
  it("fails safe when the count is unavailable and the cap was reached", () => {
    expect(truncationOf(100, null, 100)).toBe(true);
    expect(truncationOf(99, null, 100)).toBe(false);
  });
});

describe("covers", () => {
  it("treats a null coverage as everything", () => {
    expect(covers(null, "1999-01-01", "2099-12-31")).toBe(true);
  });

  it("is inclusive at both boundaries", () => {
    const c = { from: "2026-01-01", to: "2026-12-31" };
    expect(covers(c, "2026-01-01", "2026-12-31")).toBe(true);
    expect(covers(c, "2025-12-31", "2026-12-31")).toBe(false);
    expect(covers(c, "2026-01-01", "2027-01-01")).toBe(false);
  });
});

describe("canDiff", () => {
  const whole = { truncated: false, coverage: null, readError: null };

  it("passes when every store is whole", () => {
    expect(canDiff([whole, whole], "2026-01-01", "2026-12-31")).toBe(true);
  });

  it("is poisoned by a single truncated store", () => {
    expect(canDiff([whole, { truncated: true, coverage: null, readError: null }, whole], "2026-01-01", "2026-12-31")).toBe(false);
  });

  it("rejects coverage short of the forward horizon", () => {
    // SERIES_HORIZON_DAYS is 84; a 60-day window cannot answer the diff.
    const short = { truncated: false, coverage: { from: "2026-09-15", to: "2026-11-14" }, readError: null };
    expect(canDiff([short], "2026-09-15", "2026-12-08")).toBe(false);
  });

  /* The write-loop regression. materialize.ts scans from each active
     rule's own startDate, so coverage that begins after it makes rows
     that DO exist look missing: insert -> 23505 -> reload -> same diff. */
  it("rejects coverage starting after the earliest active rule", () => {
    const eighteenMonths = { truncated: false, coverage: { from: "2025-03-15", to: "2026-09-29" }, readError: null };
    expect(canDiff([eighteenMonths], "2023-01-01", "2026-09-29")).toBe(false);
  });

  /* A failed read keeps the PREVIOUS truncated/coverage and only stamps
     readError, so on a first load it still looks like EMPTY_LOAD — whole
     and complete — while the store holds zero rows. Diffing a horizon
     against nothing asks the generator to insert the entire table. */
  it("fails closed when a store's read errored, however whole it looks", () => {
    const failed = { truncated: false, coverage: null, readError: "network" };
    expect(canDiff([failed], "2026-01-01", "2026-12-31")).toBe(false);
    expect(canDiff([whole, failed], "2026-01-01", "2026-12-31")).toBe(false);
  });
});

describe("makeBreaker", () => {
  it("allows exactly max rounds and then latches", () => {
    const b = makeBreaker(3);
    expect([b.take(), b.take(), b.take()]).toEqual([true, true, true]);
    expect(b.tripped).toBe(true);
    expect(b.take()).toBe(false);
    // Latched for good: no configuration can hand back a round.
    expect(b.take()).toBe(false);
    expect(b.tripped).toBe(true);
  });

  it("is not tripped before the last round is spent", () => {
    const b = makeBreaker(2);
    b.take();
    expect(b.tripped).toBe(false);
  });
});

describe("PendingLedger", () => {
  it("refcounts, so one release of two holds keeps the id pending", () => {
    const l = new PendingLedger();
    l.hold(["a"], "write");
    l.hold(["a"], "write");
    l.release(["a"], "write");
    expect(l.snapshot().get("a")).toBe("write");
    l.release(["a"], "write");
    expect(l.snapshot().has("a")).toBe(false);
  });

  it("lets a pending delete outrank a pending write on the same id", () => {
    const l = new PendingLedger();
    l.hold(["a"], "write");
    l.hold(["a"], "delete");
    expect(l.snapshot().get("a")).toBe("delete");
  });

  it("releasing an id it never held is harmless", () => {
    const l = new PendingLedger();
    l.release(["ghost"], "write");
    expect(l.snapshot().size).toBe(0);
  });
});

describe("mergeLoaded", () => {
  it("returns the fetched list by identity when nothing is pending", () => {
    const fetched = [thing("a"), thing("b")];
    expect(mergeLoaded([thing("z")], fetched, new Map())).toBe(fetched);
  });

  /* The reload-clobbers-an-optimistic-insert regression: a read that
     started before the insert resolves after it and cannot see the row. */
  it("keeps a pending write the read could not see, at the head", () => {
    const pending = new Map([["new", "write" as const]]);
    const out = mergeLoaded([thing("new"), thing("a")], [thing("a")], pending);
    expect(out.map((t) => t.id)).toEqual(["new", "a"]);
  });

  it("prefers the local copy of a pending write over the fetched one", () => {
    const pending = new Map([["a", "write" as const]]);
    const out = mergeLoaded([thing("a", "patched")], [thing("a", "stale")], pending);
    expect(out).toEqual([{ id: "a", label: "patched" }]);
  });

  /* The case a naive Set<string> gets wrong: the row is still on the
     server, so it comes back in the page — and must stay dropped. */
  it("does not resurrect a row a pending delete removed", () => {
    const pending = new Map([["gone", "delete" as const]]);
    const out = mergeLoaded([thing("a")], [thing("gone"), thing("a")], pending);
    expect(out.map((t) => t.id)).toEqual(["a"]);
  });

  it("lets the server win for an id nothing is holding", () => {
    const pending = new Map([["other", "write" as const]]);
    const out = mergeLoaded([thing("a", "local")], [thing("a", "server")], pending);
    expect(out).toEqual([{ id: "a", label: "server" }]);
  });

  it("preserves fetched order for unheld rows", () => {
    const pending = new Map([["x", "write" as const]]);
    const out = mergeLoaded([thing("x")], [thing("c"), thing("b"), thing("a")], pending);
    expect(out.map((t) => t.id)).toEqual(["x", "c", "b", "a"]);
  });
});

describe("deadline", () => {
  /* Reads had no deadline at all, so a socket that never answered pinned
     `loading` — the OR of nineteen stores — on forever. */
  it("aborts once the time is up", async () => {
    const { signal } = deadline(5);
    expect(signal.aborted).toBe(false);
    await new Promise((r) => setTimeout(r, 25));
    expect(signal.aborted).toBe(true);
  });

  it("does not abort a request that finished in time", async () => {
    const { signal, done } = deadline(5);
    done();
    await new Promise((r) => setTimeout(r, 25));
    expect(signal.aborted).toBe(false);
  });
});
