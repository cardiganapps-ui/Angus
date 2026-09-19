import { describe, expect, it } from "vitest";
import { notePreview } from "../noteText";

describe("notePreview", () => {
  it("strips markdown and joins lines", () => {
    expect(notePreview("# Título\n- [ ] Probar\n**negrita**")).toBe("Título · Probar · negrita");
  });

  it("skips a first line that only repeats the note's title", () => {
    expect(notePreview("# Ideas para Raíces III\n- Paleta más fría", 110, "Ideas para Raíces III")).toBe("Paleta más fría");
  });

  it("cuts at a word, never mid-word, never on a dangling separator", () => {
    const out = notePreview("Paleta más fría\nFormato vertical\nProbar imprimación gris", 36);
    expect(out).toBe("Paleta más fría · Formato vertical…");
    expect(out.endsWith(" ·")).toBe(false);
  });

  it("returns the whole thing untouched when it fits", () => {
    expect(notePreview("corta", 110)).toBe("corta");
  });
});
