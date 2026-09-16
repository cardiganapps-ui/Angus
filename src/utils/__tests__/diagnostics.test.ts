import { beforeEach, describe, expect, it } from "vitest";
import {
  DIAGNOSTICS_KEY,
  MAX_EVENTS,
  appendEvent,
  clearEvents,
  readEvents,
  recordEvent,
  resetForTests,
  summarize,
  verdict,
  type DiagnosticEvent,
  type DiagnosticsStore
} from "../../lib/diagnostics";

/** A localStorage stand-in; `fail` makes every call throw, like private mode. */
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

const evt = (over: Partial<DiagnosticEvent> = {}): DiagnosticEvent => ({
  at: "2026-09-16T10:00:00.000Z",
  kind: "write",
  scope: "guardar",
  message: "boom",
  count: 1,
  ...over
});

beforeEach(() => resetForTests());

describe("appendEvent", () => {
  it("puts the newest first", () => {
    const out = appendEvent([evt({ message: "old" })], evt({ message: "new" }));
    expect(out.map((e) => e.message)).toEqual(["new", "old"]);
  });

  it("evicts the oldest at the cap", () => {
    let events: DiagnosticEvent[] = [];
    for (let i = 0; i < 5; i++) events = appendEvent(events, evt({ message: `m${i}` }), 3);
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.message)).toEqual(["m4", "m3", "m2"]);
  });

  /* A retried write or an offline read would otherwise evict the whole
     history with 50 copies of one message. */
  it("collapses an identical repeat into a count instead of a new entry", () => {
    const first = appendEvent([], evt({ at: "2026-09-16T10:00:00.000Z" }));
    const second = appendEvent(first, evt({ at: "2026-09-16T10:05:00.000Z" }));
    expect(second).toHaveLength(1);
    expect(second[0].count).toBe(2);
    // The first occurrence keeps `at`; the latest is recorded separately.
    expect(second[0].at).toBe("2026-09-16T10:00:00.000Z");
    expect(second[0].lastAt).toBe("2026-09-16T10:05:00.000Z");
  });

  it("only collapses against the newest, so an alternating pair stays two", () => {
    let events = appendEvent([], evt({ message: "a" }));
    events = appendEvent(events, evt({ message: "b" }));
    events = appendEvent(events, evt({ message: "a" }));
    expect(events.map((e) => e.message)).toEqual(["a", "b", "a"]);
    expect(events.every((e) => e.count === 1)).toBe(true);
  });

  it("does not collapse across kinds or scopes", () => {
    let events = appendEvent([], evt({ kind: "write" }));
    events = appendEvent(events, evt({ kind: "read" }));
    expect(events).toHaveLength(2);
  });

  it("never returns an empty buffer for a zero or negative cap", () => {
    expect(appendEvent([], evt(), 0)).toHaveLength(1);
  });
});

describe("summarize / verdict", () => {
  it("counts occurrences rather than entries", () => {
    const events = [evt({ count: 7 }), evt({ kind: "read", message: "r", count: 2 })];
    const s = summarize(events);
    expect(s.entries).toBe(2);
    expect(s.occurrences).toBe(9);
    expect(s.byKind.write).toBe(7);
    expect(s.byKind.read).toBe(2);
    expect(s.latest?.count).toBe(7);
  });

  it("reads calm when there is nothing to say", () => {
    expect(verdict(summarize([]))).toBe("Todo en orden");
  });

  it("singularises one aviso and leads with a crash", () => {
    expect(verdict(summarize([evt()]))).toBe("1 aviso");
    expect(verdict(summarize([evt({ count: 4 })]))).toBe("4 avisos");
    expect(verdict(summarize([evt({ kind: "crash", message: "x" })]))).toBe("Algo se rompió · revísalo");
  });
});

describe("recordEvent / readEvents", () => {
  it("persists through the store and reads back", () => {
    const store = fakeStore();
    recordEvent("write", "guardar", "no sirvió", "2026-09-16T10:00:00.000Z", store);
    expect(JSON.parse(store.data[DIAGNOSTICS_KEY])).toHaveLength(1);
    resetForTests();
    expect(readEvents(store)[0].message).toBe("no sirvió");
  });

  it("bounds a long message rather than storing it whole", () => {
    const store = fakeStore();
    const events = recordEvent("write", "guardar", "x".repeat(1000), "2026-09-16T10:00:00.000Z", store);
    expect(events[0].message.length).toBeLessThanOrEqual(301);
    expect(events[0].message.endsWith("…")).toBe(true);
  });

  it("collapses whitespace so a multi-line Postgres error stays one line", () => {
    const store = fakeStore();
    const events = recordEvent("read", "notes", "  line one\n\n  line two  ", "2026-09-16T10:00:00.000Z", store);
    expect(events[0].message).toBe("line one line two");
  });

  /* A device that refuses storage must still get a session-long log,
     and must never throw into a render. */
  it("degrades to memory when the store throws", () => {
    const store = fakeStore({}, true);
    expect(() => recordEvent("crash", "render", "kaboom", "2026-09-16T10:00:00.000Z", store)).not.toThrow();
    expect(readEvents(store)[0].message).toBe("kaboom");
  });

  it("works with no store at all", () => {
    expect(() => recordEvent("read", "sales", "offline", "2026-09-16T10:00:00.000Z", null)).not.toThrow();
    expect(readEvents(null)).toHaveLength(1);
  });

  it("discards a corrupt blob instead of crashing the app", () => {
    expect(readEvents(fakeStore({ [DIAGNOSTICS_KEY]: "{not json" }))).toEqual([]);
    resetForTests();
    expect(readEvents(fakeStore({ [DIAGNOSTICS_KEY]: '{"a":1}' }))).toEqual([]);
    resetForTests();
    // A valid array with junk members keeps only the well-formed ones.
    const mixed = JSON.stringify([evt(), { nope: true }, 42]);
    expect(readEvents(fakeStore({ [DIAGNOSTICS_KEY]: mixed }))).toHaveLength(1);
  });

  it("caps what it restores from storage", () => {
    const many = JSON.stringify(Array.from({ length: 200 }, (_, i) => evt({ message: `m${i}` })));
    expect(readEvents(fakeStore({ [DIAGNOSTICS_KEY]: many }))).toHaveLength(MAX_EVENTS);
  });

  it("clears both copies", () => {
    const store = fakeStore();
    recordEvent("write", "guardar", "x", "2026-09-16T10:00:00.000Z", store);
    clearEvents(store);
    expect(store.data[DIAGNOSTICS_KEY]).toBeUndefined();
    expect(readEvents(store)).toEqual([]);
  });
});
