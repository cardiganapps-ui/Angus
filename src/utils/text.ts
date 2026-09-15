/** "Crítica: ¿qué pasó?" → "Critica-que-paso.pdf" — a safe download name from a title. */
export function slugFilename(title: string, ext: string, fallback = "nota"): string {
  const slug =
    title
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || fallback;
  return `${slug}.${ext}`;
}

/** Accent-insensitive, case-insensitive contains — for search boxes. */
export function matches(haystack: string, needle: string): boolean {
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return norm(haystack).includes(norm(needle.trim()));
}
