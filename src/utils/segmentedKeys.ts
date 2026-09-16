/* Keyboard arithmetic for <SegmentedControl role="radiogroup">.
   Lives here rather than in the component so it can be tested without
   a DOM (and so the component file keeps exporting only components,
   which is what react-refresh wants). */

/* Which option an arrow key moves to, or null when the key isn't ours.
   Wraps at both ends, per the ARIA radiogroup pattern; an empty or
   unmatched selection is treated as "sitting on the first option" so
   the first arrow press lands somewhere real. */
export function nextSegmentIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  const at = current >= 0 && current < count ? current : 0;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (at + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (at - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/* Roving tabindex: only the checked option is in the tab order, so Tab
   enters and leaves the group in one press. With nothing checked the
   first option carries it, otherwise the group would be unreachable. */
export function segmentTabIndex(index: number, activeIndex: number): 0 | -1 {
  if (activeIndex < 0) return index === 0 ? 0 : -1;
  return index === activeIndex ? 0 : -1;
}
