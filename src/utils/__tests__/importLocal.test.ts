import { beforeEach, describe, expect, it, vi } from "vitest";

/* importLocal is the Prime Directive's reference implementation for a
   one-shot migration: it must never clear a local key whose contents it
   could not read, because that key is the only copy of whatever it holds.
   The "nothing to import" path always honoured that; the import path did
   not, and cleared an unparseable key whenever a SIBLING key happened to
   have rows — which is the case this file exists to pin. */

const upsert = vi.fn(async () => ({ error: null as { message: string } | null }));
vi.mock("../../lib/supabase", () => ({
  supabase: { from: () => ({ upsert }) }
}));

const { importLocalData } = await import("../../lib/importLocal");

const KEYS = { contacts: "angus.contacts", projects: "angus.projects", events: "angus.events" };

function fakeStorage(initial: Record<string, string>) {
  const map = new Map(Object.entries(initial));
  return {
    store: map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    }
  };
}

const contact = (id: string) => ({ id, name: `C${id}`, relationship: "client", email: "", phone: "", notes: "" });

let storage: ReturnType<typeof fakeStorage>;
const install = (initial: Record<string, string>) => {
  storage = fakeStorage(initial);
  vi.stubGlobal("localStorage", storage);
};

beforeEach(() => {
  upsert.mockClear();
  upsert.mockImplementation(async () => ({ error: null }));
});

describe("importLocalData", () => {
  it("clears every key it could read once the rows have landed", async () => {
    install({
      [KEYS.contacts]: JSON.stringify([contact("a")]),
      [KEYS.projects]: JSON.stringify([]),
      [KEYS.events]: JSON.stringify([])
    });
    await expect(importLocalData("ws-1")).resolves.toBe(true);
    expect(storage.store.has(KEYS.contacts)).toBe(false);
    expect(storage.store.has(KEYS.projects)).toBe(false);
    expect(storage.store.has(KEYS.events)).toBe(false);
  });

  /* The regression. A corrupt blob yields no rows, so the loop skipped its
     upsert and then deleted the key anyway — destroying data that was
     still recoverable by hand. */
  it("leaves an unparseable key alone while importing its readable siblings", async () => {
    install({
      [KEYS.contacts]: JSON.stringify([contact("a")]),
      [KEYS.projects]: "{ this is not JSON",
      [KEYS.events]: JSON.stringify([])
    });
    await expect(importLocalData("ws-1")).resolves.toBe(true);
    expect(storage.store.has(KEYS.contacts)).toBe(false);
    expect(storage.store.get(KEYS.projects)).toBe("{ this is not JSON");
    expect(storage.store.has(KEYS.events)).toBe(false);
  });

  it("leaves a key holding valid JSON that is not an array alone", async () => {
    install({
      [KEYS.contacts]: JSON.stringify([contact("a")]),
      [KEYS.projects]: JSON.stringify({ oops: true }),
      [KEYS.events]: JSON.stringify([])
    });
    await importLocalData("ws-1");
    expect(storage.store.get(KEYS.projects)).toBe(JSON.stringify({ oops: true }));
  });

  /* The pre-existing guarantee, kept honest: with nothing to import, an
     unreadable key still survives. */
  it("clears nothing unreadable on the nothing-to-import path", async () => {
    install({ [KEYS.contacts]: "nope", [KEYS.projects]: JSON.stringify([]), [KEYS.events]: JSON.stringify([]) });
    await expect(importLocalData("ws-1")).resolves.toBe(false);
    expect(storage.store.get(KEYS.contacts)).toBe("nope");
    expect(storage.store.has(KEYS.projects)).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("keeps a key whose rows the server refused", async () => {
    install({
      [KEYS.contacts]: JSON.stringify([contact("a")]),
      [KEYS.projects]: JSON.stringify([]),
      [KEYS.events]: JSON.stringify([])
    });
    upsert.mockImplementation(async () => ({ error: { message: "denied" } }));
    await expect(importLocalData("ws-1")).rejects.toThrow("denied");
    expect(storage.store.get(KEYS.contacts)).toBe(JSON.stringify([contact("a")]));
  });
});
