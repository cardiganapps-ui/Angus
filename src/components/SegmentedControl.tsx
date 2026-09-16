/**
 * Shared pill segmented control with animated slider (port of
 * Cardigan's SegmentedControl).
 *
 * The slider's position is driven by CSS variables (--active-i,
 * --tab-count) on the container — see .segmented-slider in
 * components.css. Earlier this component measured each button's
 * getBoundingClientRect() and applied the result as inline
 * `style={{ left, width }}` on the slider. That approach was
 * unreliable on iOS WKWebView under certain layout timings: the
 * measurement could capture button positions before flex layout
 * stabilized post-mount, producing a slider that visually landed
 * one slot off from the active button. Since all buttons in this
 * control share `flex: 1 1 0` (equal width), the position can be
 * computed purely from `active-index / total-count` via CSS calc
 * — no measurement, no timing windows, deterministic across every
 * render path.
 *
 * Props:
 *   items   — [{ k, l }] where k is the value, l is the label
 *   value   — currently selected key
 *   onChange(key)
 *   size    — "sm" (default) | "md" — md uses heavier font for primary tabs
 *   role, ariaLabel — optional pass-through
 *
 * Two ARIA shapes, picked by `role`:
 *   "tablist" (default) — children are role="tab" + aria-selected.
 *   "radiogroup"        — children are role="radio" + aria-checked, with
 *                         the roving tabindex + arrow-key selection the
 *                         ARIA radiogroup pattern requires. Modeled on
 *                         ChipSelect, the other custom radio group here.
 */
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { haptic } from "../lib/haptics";
import { nextSegmentIndex, segmentTabIndex } from "../utils/segmentedKeys";

interface SegItem { k: string; l: ReactNode }

export function SegmentedControl({ items, value, onChange, size = "sm", role = "tablist", ariaLabel, style }: {
  items: SegItem[];
  value: string;
  onChange: (key: string) => void;
  size?: "sm" | "md";
  role?: string;
  ariaLabel?: string;
  style?: CSSProperties;
}) {
  const activeIndex = items.findIndex(it => it.k === value);
  const showSlider = activeIndex >= 0;
  const isRadio = role === "radiogroup";
  const rootRef = useRef<HTMLDivElement>(null);

  // Edge bounce — same intent as before: when the slider lands on
  // the first or last tab, swap the easing to a momentum-squish
  // anchored to that wall so the spring overshoot doesn't poke
  // past the container. Tracked locally; nulled out after the
  // animation duration so repeating the same selection replays.
  const [edgeBounce, setEdgeBounce] = useState<"left" | "right" | null>(null);
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (items?.length) {
      if (items[0].k === value) setEdgeBounce("left");
      else if (items[items.length - 1].k === value) setEdgeBounce("right");
      else setEdgeBounce(null);
    }
  }
  useEffect(() => {
    if (!edgeBounce) return;
    const id = setTimeout(() => setEdgeBounce(null), 620);
    return () => clearTimeout(id);
  }, [edgeBounce]);

  const sliderClass = `segmented-slider${
    edgeBounce === "left" ? " segmented-slider--edge-left"
      : edgeBounce === "right" ? " segmented-slider--edge-right"
      : ""
  }`;

  // Arrow keys move AND select, which is the radiogroup contract. The
  // buttons are the only element children besides the slider span, so
  // a plain button query indexes 1:1 with `items`.
  const select = (index: number) => {
    const it = items[index];
    if (!it) return;
    if (it.k !== value) haptic.tap();
    onChange(it.k);
    rootRef.current?.querySelectorAll("button")[index]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!isRadio) return;
    const next = nextSegmentIndex(e.key, index, items.length);
    if (next == null) return;
    e.preventDefault();
    select(next);
  };

  return (
    <div
      ref={rootRef}
      className={`segmented segmented--${size}`}
      role={role}
      aria-label={ariaLabel}
      style={{ "--active-i": activeIndex, "--tab-count": items.length, ...style } as CSSProperties}
    >
      {showSlider && <span className={sliderClass} aria-hidden="true" />}
      {items.map((it, i) => (
        <button
          key={it.k}
          role={isRadio ? "radio" : role === "tablist" ? "tab" : undefined}
          aria-selected={role === "tablist" ? value === it.k : undefined}
          aria-checked={isRadio ? value === it.k : undefined}
          tabIndex={isRadio ? segmentTabIndex(i, activeIndex) : undefined}
          className={`segmented-btn ${value === it.k ? "active" : ""}`}
          onClick={() => {
            if (it.k !== value) haptic.tap();
            onChange(it.k);
          }}
          onKeyDown={(e) => onKeyDown(e, i)}
          type="button"
        >
          {it.l}
        </button>
      ))}
    </div>
  );
}
