import { beforeEach, describe, expect, it } from "vitest";
import { AppErrorBoundary } from "../../components/AppErrorBoundary";
import { readEvents, resetForTests } from "../../lib/diagnostics";

/* The boundary's interesting behaviour is its state machine, and both
   halves of it are static pure functions — so this needs no DOM. What is
   NOT covered here is the render: that it paints the Spanish recovery
   card inside the shell needs jsdom, which is a separate decision. */

type State = { message: string | null; resetKey?: string };
type Props = { children: null; resetKey?: string };

const derive = (props: Props, state: State) =>
  (AppErrorBoundary as unknown as {
    getDerivedStateFromProps(p: Props, s: State): Partial<State> | null;
  }).getDerivedStateFromProps(props, state);

const fromError = (e: unknown) =>
  (AppErrorBoundary as unknown as {
    getDerivedStateFromError(e: unknown): Partial<State>;
  }).getDerivedStateFromError(e);

beforeEach(() => resetForTests());

describe("getDerivedStateFromError", () => {
  it("takes an Error's message", () => {
    expect(fromError(new Error("boom")).message).toBe("boom");
  });

  it("stringifies a thrown non-Error", () => {
    expect(fromError("just a string").message).toBe("just a string");
    expect(fromError(undefined).message).toBe("undefined");
  });
});

describe("getDerivedStateFromProps", () => {
  it("does nothing while there is no error", () => {
    expect(derive({ children: null, resetKey: "home" }, { message: null, resetKey: "home" })).toBeNull();
  });

  /* Her escape hatch. The shell survives a crash, so tapping another tab
     must render that screen rather than inherit this one's failure. */
  it("clears the error when the route changes", () => {
    const next = derive({ children: null, resetKey: "money" }, { message: "boom", resetKey: "home" });
    expect(next).toEqual({ message: null, resetKey: "money" });
  });

  it("keeps the error while the route is unchanged", () => {
    expect(derive({ children: null, resetKey: "home" }, { message: "boom", resetKey: "home" })).toBeNull();
  });

  /* First render after a throw: the boundary has not recorded a key yet,
     so it must latch the current one instead of treating undefined as a
     navigation and clearing itself immediately. */
  it("adopts the key on first sight without clearing", () => {
    expect(derive({ children: null, resetKey: "home" }, { message: null, resetKey: undefined })).toEqual({
      resetKey: "home"
    });
  });

  it("does not self-clear when no resetKey is supplied at all", () => {
    expect(derive({ children: null }, { message: "boom", resetKey: undefined })).toBeNull();
  });
});

describe("componentDidCatch", () => {
  it("records the message and the first stack frame", () => {
    const boundary = new AppErrorBoundary({ children: null });
    boundary.componentDidCatch(new Error("render exploded"), {
      componentStack: "\n    at Money (money.tsx:12)\n    at Shell (App.tsx:3)"
    });
    const [event] = readEvents(null);
    expect(event.kind).toBe("crash");
    expect(event.message).toBe("render exploded");
    // The frame identifies WHERE — "Algo se rompió" alone names nothing.
    expect(event.scope).toBe("at Money (money.tsx:12)");
  });

  it("falls back to a generic scope when there is no stack", () => {
    const boundary = new AppErrorBoundary({ children: null });
    boundary.componentDidCatch(new Error("nope"), { componentStack: "" });
    expect(readEvents(null)[0].scope).toBe("render");
  });
});
