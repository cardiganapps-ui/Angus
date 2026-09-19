import { formatShort } from "./dates";

/** "ahora" · "hace 5 min" · "hace 2 h" · "ayer" · "hace 3 días" · "12 sep". */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return formatShort(iso.slice(0, 10));
}

/** One line of a note's body without markdown syntax, for list rows
    ("Tema · Ideas clave · …"). Cut at a word, never mid-word or on a
    dangling " ·", with an ellipsis when something was left out; a first
    line that merely repeats `title` is skipped. */
export function notePreview(content: string, max = 110, title?: string): string {
  const wanted = title?.trim().toLocaleLowerCase();
  const lines = content
    .split("\n")
    .map((l) =>
      l
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/^\s*(#{1,3}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|\[[ xX]\]\s+|>\s*)/, "")
        .replace(/[*~`]/g, "")
        .trim()
    )
    .filter(Boolean)
    .filter((l, i) => !(i === 0 && wanted && l.toLocaleLowerCase() === wanted));
  const joined = lines.join(" · ");
  if (joined.length <= max) return joined;
  const cut = joined
    .slice(0, max)
    .replace(/\s*\S*$/, "")
    .replace(/\s*·\s*$/, "")
    .trim();
  return cut ? `${cut}…` : `${joined.slice(0, max).trim()}…`;
}
