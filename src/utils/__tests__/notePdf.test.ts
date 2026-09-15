import { describe, expect, it } from "vitest";
import { buildNotePdf, pdfFilename } from "../../lib/notePdf";

describe("notePdf", () => {
  it("renders headings, lists, tasks and inline styles onto one page", async () => {
    const doc = await buildNotePdf({
      note: {
        title: "Apuntes · Teoría del color",
        content: "# Ideas clave\n\n- **Complementarios** vibran\n- *Análogos* calman\n\n[ ] Leer capítulo 3\n[x] Boceto ~~viejo~~ nuevo\n\n> Cita de la maestra con `código`",
        updatedAt: "2026-09-15T17:00:00.000Z"
      },
      context: ["Maestría en Artes Visuales", "Sesión · mar 15 sep 17:00"],
      artistName: "Andrea",
      now: new Date("2026-09-15T18:00:00Z")
    });
    expect(doc.getNumberOfPages()).toBe(1);
    expect((doc.output("arraybuffer") as ArrayBuffer).byteLength).toBeGreaterThan(1000);
  });

  it("spills a long note onto more pages and shows a placeholder for a missing image", async () => {
    const lines = Array.from({ length: 120 }, (_, i) => `Línea ${i + 1} con suficiente texto para ocupar espacio en la página.`);
    const doc = await buildNotePdf({
      note: { title: "Larga", content: ["![](attachment:00000000-0000-0000-0000-000000000001)", ...lines].join("\n"), updatedAt: "bad-date" },
      imageResolver: async () => null
    });
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

  it("slugs the filename", () => {
    expect(pdfFilename("Crítica: ¿qué pasó?  hoy")).toBe("Critica-que-paso-hoy.pdf");
    expect(pdfFilename("")).toBe("nota.pdf");
  });
});
