/** Accent-insensitive, case-insensitive contains — for search boxes. */
export function matches(haystack: string, needle: string): boolean {
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return norm(haystack).includes(norm(needle.trim()));
}
