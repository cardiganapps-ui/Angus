/* ── Note → PDF ──
   Renders one note to a PDF she can hand to a teacher or keep with a
   course. Pure client work with jsPDF (a note is short and its markdown
   surface is small — the in-app editor only produces h1–h3, paragraphs,
   lists, tasks and inline strong/em/code/strike/mark), loaded lazily so
   the bundle only pays for it on the first export.

   Images: `![](attachment:<id>)` lines are replaced by the resolved
   attachment (first MAX_INLINE_IMAGES by body order). The caller passes
   an `imageResolver` that returns a data URL, so this module knows
   nothing about R2 or signed URLs.

   Fonts are jsPDF's built-in Helvetica (WinAnsi), so anything outside
   Latin-1 — checkboxes included — is drawn, not typed. */

import { jsPDF } from "jspdf";
import { tokenizeLine, type InlineToken } from "../utils/markdownModel";
import { slugFilename } from "../utils/text";
import type { NoteAttachment } from "../types";

type RGB = [number, number, number];
interface ResolvedImage { dataUrl: string; mime: string; width: number | null; height: number | null }

export interface BuildNotePdfArgs {
  note: { title: string; content: string; updatedAt: string };
  attachments?: NoteAttachment[];
  /** "Maestría en Artes Visuales", "Sesión · mar 15 sep", … — printed under the title. */
  context?: string[];
  artistName?: string;
  imageResolver?: ((a: NoteAttachment) => Promise<string | null>) | null;
  now?: Date;
}

const MAX_INLINE_IMAGES = 10;
const PAGE = { format: "letter", unit: "mm", margin: 18, footer: 16 } as const;

// Print approximations of the design tokens (plum charcoal, rose accent).
const COLORS: Record<string, RGB> = {
  charcoal: [46, 36, 49],
  charcoalMd: [110, 96, 112],
  charcoalXl: [160, 148, 162],
  accent: [178, 74, 112],
  hairline: [232, 220, 226],
  codeBg: [250, 243, 245],
  markBg: [255, 241, 200],
  strikeRule: [180, 170, 182]
};

const setColor = (doc: jsPDF, [r, g, b]: RGB) => doc.setTextColor(r, g, b);
const usableBottom = (doc: jsPDF) => doc.internal.pageSize.getHeight() - PAGE.footer;

function setStyle(doc: jsPDF, kind?: string) {
  if (kind === "strong") doc.setFont("helvetica", "bold");
  else if (kind === "em") doc.setFont("helvetica", "italic");
  else if (kind === "code") doc.setFont("courier", "normal");
  else doc.setFont("helvetica", "normal");
}

function pageBreakIfNeeded(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > usableBottom(doc)) {
    doc.addPage();
    return PAGE.margin;
  }
  return y;
}

/* Wraps inline tokens word by word so a style boundary survives a
   line break (jsPDF's splitTextToSize can't keep per-word fonts). A
   wrapped line that would fall into the footer starts a new page. */
function renderInline(doc: jsPDF, inline: InlineToken[], x: number, y: number, maxWidth: number, lineHeight: number, heading: boolean): number {
  let cursorX = x;
  const words: { text: string; kind: string }[] = [];
  for (const tok of inline) {
    if (!tok.text) continue;
    for (const p of tok.text.split(/(\s+)/)) if (p) words.push({ text: p, kind: tok.kind });
  }
  for (const w of words) {
    setStyle(doc, heading ? "strong" : w.kind);
    const width = doc.getTextWidth(w.text);
    const whitespace = /^\s+$/.test(w.text);
    if (cursorX + width > x + maxWidth && !whitespace && cursorX > x) {
      y = pageBreakIfNeeded(doc, y + lineHeight, 0);
      cursorX = x;
    }
    if (whitespace && cursorX === x) continue;
    if (w.kind === "code" || w.kind === "mark") {
      const h = lineHeight * 0.78;
      doc.setFillColor(...(w.kind === "code" ? COLORS.codeBg : COLORS.markBg));
      doc.rect(cursorX - 0.6, y - h + 1.2, width + 1.2, h, "F");
    }
    doc.text(w.text, cursorX, y);
    if (w.kind === "strike") {
      doc.setDrawColor(...COLORS.strikeRule);
      doc.setLineWidth(0.18);
      doc.line(cursorX, y - 1.3, cursorX + width, y - 1.3);
    }
    cursorX += width;
  }
  return y;
}

function attachmentRefs(line: string): string[] {
  const out: string[] = [];
  const re = /!\[[^\]]*\]\(attachment:([0-9a-f-]+)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) out.push(m[1]);
  return out;
}

function drawHeader(doc: jsPDF, artistName: string): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  setColor(doc, COLORS.accent);
  doc.text("Angus", PAGE.margin, PAGE.margin + 4);
  if (artistName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    setColor(doc, COLORS.charcoalMd);
    doc.text(artistName, pageWidth - PAGE.margin, PAGE.margin + 4, { align: "right" });
  }
  doc.setDrawColor(...COLORS.hairline);
  doc.line(PAGE.margin, PAGE.margin + 8, pageWidth - PAGE.margin, PAGE.margin + 8);
  return PAGE.margin + 16;
}

function drawTitle(doc: jsPDF, title: string, y: number): number {
  const maxWidth = doc.internal.pageSize.getWidth() - PAGE.margin * 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  setColor(doc, COLORS.charcoal);
  for (const line of doc.splitTextToSize(title || "Sin título", maxWidth) as string[]) {
    y = pageBreakIfNeeded(doc, y, 10);
    doc.text(line, PAGE.margin, y);
    y += 10;
  }
  return y + 2;
}

function drawMeta(doc: jsPDF, bits: string[], y: number): number {
  if (bits.length === 0) return y;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setColor(doc, COLORS.charcoalMd);
  const maxWidth = doc.internal.pageSize.getWidth() - PAGE.margin * 2;
  for (const line of doc.splitTextToSize(bits.join("   ·   "), maxWidth) as string[]) {
    y = pageBreakIfNeeded(doc, y, 5);
    doc.text(line, PAGE.margin, y);
    y += 4.5;
  }
  return y + 4;
}

function drawPlaceholder(doc: jsPDF, message: string, y: number): number {
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  setColor(doc, COLORS.charcoalXl);
  y = pageBreakIfNeeded(doc, y, 5);
  doc.text(message, PAGE.margin, y);
  return y + 6;
}

/* A task checkbox: Helvetica has no ☐/☑, so draw a 3.2 mm box and a tick. */
function drawCheckbox(doc: jsPDF, x: number, baseline: number, checked: boolean) {
  const size = 3.2;
  const top = baseline - size + 0.6;
  doc.setDrawColor(...(checked ? COLORS.accent : COLORS.charcoalXl));
  doc.setLineWidth(0.3);
  if (checked) {
    doc.setFillColor(...COLORS.accent);
    doc.roundedRect(x, top, size, size, 0.6, 0.6, "FD");
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.45);
    doc.line(x + 0.7, top + size * 0.55, x + size * 0.42, top + size * 0.8);
    doc.line(x + size * 0.42, top + size * 0.8, x + size - 0.6, top + size * 0.25);
  } else {
    doc.roundedRect(x, top, size, size, 0.6, 0.6, "D");
  }
}

async function drawImage(doc: jsPDF, image: ResolvedImage, y: number): Promise<number> {
  if (/^image\/(heic|heif)$/i.test(image.mime)) return drawPlaceholder(doc, "[imagen HEIC no soportada en PDF]", y);
  let w = image.width;
  let h = image.height;
  if (!w || !h) {
    const probe = await new Promise<{ w: number; h: number } | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = image.dataUrl;
    });
    if (!probe?.w || !probe.h) return drawPlaceholder(doc, "[imagen no disponible]", y);
    w = probe.w;
    h = probe.h;
  }
  const maxWidth = doc.internal.pageSize.getWidth() - PAGE.margin * 2;
  // Fit inside 90 mm wide and one page tall (a long screenshot scales down).
  const maxHeight = usableBottom(doc) - PAGE.margin - 4;
  let widthMm = Math.min(maxWidth, 90);
  let heightMm = (widthMm * h) / w;
  if (heightMm > maxHeight) {
    heightMm = maxHeight;
    widthMm = (heightMm * w) / h;
  }
  y = pageBreakIfNeeded(doc, y, heightMm + 6);
  const fmt = /^data:image\/png/i.test(image.dataUrl) ? "PNG" : /^data:image\/webp/i.test(image.dataUrl) ? "WEBP" : "JPEG";
  try {
    doc.addImage(image.dataUrl, fmt, PAGE.margin, y, widthMm, heightMm);
  } catch {
    return drawPlaceholder(doc, "[imagen no disponible]", y);
  }
  return y + heightMm + 4;
}

async function drawBody(doc: jsPDF, lines: string[], y: number, images: Map<string, ResolvedImage>): Promise<number> {
  const maxWidth = doc.internal.pageSize.getWidth() - PAGE.margin * 2;
  let rendered = 0;
  for (const raw of lines) {
    const refs = attachmentRefs(raw);
    if (refs.length > 0) {
      for (const id of refs) {
        if (rendered >= MAX_INLINE_IMAGES) {
          y = drawPlaceholder(doc, `[imagen omitida — máximo ${MAX_INLINE_IMAGES} por PDF]`, y);
          continue;
        }
        const image = images.get(id);
        y = image ? await drawImage(doc, image, y) : drawPlaceholder(doc, "[imagen no disponible]", y);
        if (image) rendered += 1;
      }
      continue;
    }
    const token = tokenizeLine(raw);
    let lineHeight = 5.4;
    let fontSize = 10;
    let leftPad = 0;
    let prefix = "";
    let checkbox: boolean | null = null;
    if (token.block === "h1") { fontSize = 18; lineHeight = 8; }
    else if (token.block === "h2") { fontSize = 14; lineHeight = 7; }
    else if (token.block === "h3") { fontSize = 12; lineHeight = 6; }
    else if (token.block === "ul") { prefix = "•  "; leftPad = token.indent * 1.4; }
    else if (token.block === "ol") { prefix = `${token.listMarker || "1."}  `; leftPad = token.indent * 1.4; }
    else if (token.block === "task") { checkbox = token.taskChecked; leftPad = token.indent * 1.4; }

    if (token.block === "p" && token.inline.length === 0) {
      y += lineHeight * 0.6;
      continue;
    }
    y = pageBreakIfNeeded(doc, y, lineHeight);
    doc.setFontSize(fontSize);
    const heading = token.block === "h1" || token.block === "h2" || token.block === "h3";
    doc.setFont("helvetica", heading ? "bold" : "normal");
    setColor(doc, checkbox === true ? COLORS.charcoalMd : COLORS.charcoal);
    let x = PAGE.margin + leftPad;
    let prefixWidth = 0;
    if (checkbox !== null) {
      drawCheckbox(doc, x, y, checkbox);
      prefixWidth = 5.2;
      x += prefixWidth;
    } else if (prefix) {
      doc.text(prefix, x, y);
      prefixWidth = doc.getTextWidth(prefix);
      x += prefixWidth;
    }
    y = renderInline(doc, token.inline, x, y, maxWidth - leftPad - prefixWidth, lineHeight, heading);
    y += lineHeight + (heading ? 1 : 0);
  }
  return y;
}

function drawFooter(doc: jsPDF, artistName: string, now: Date) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setColor(doc, COLORS.charcoalXl);
  const generated = now.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.text(`Generado el ${generated}`, PAGE.margin, pageHeight - 10);
    doc.text(`${artistName ? `${artistName}  ·  ` : ""}${p} / ${total}`, pageWidth - PAGE.margin, pageHeight - 10, { align: "right" });
  }
}

export async function buildNotePdf({ note, attachments = [], context = [], artistName = "", imageResolver = null, now = new Date() }: BuildNotePdfArgs) {
  // Resolve the first MAX_INLINE_IMAGES references in body order, so the
  // images she sees are the ones she placed first, not the ones uploaded first.
  const images = new Map<string, ResolvedImage>();
  if (imageResolver) {
    const byId = new Map(attachments.map((a) => [a.id, a]));
    const ordered: string[] = [];
    for (const line of note.content.split("\n")) for (const id of attachmentRefs(line)) if (!ordered.includes(id)) ordered.push(id);
    const eligible = ordered.slice(0, MAX_INLINE_IMAGES).map((id) => byId.get(id)).filter((a): a is NoteAttachment => !!a);
    await Promise.all(
      eligible.map(async (a) => {
        try {
          const dataUrl = await imageResolver(a);
          if (dataUrl) images.set(a.id, { dataUrl, mime: a.mime, width: a.width, height: a.height });
        } catch {
          /* placeholder renders */
        }
      })
    );
  }

  const doc = new jsPDF({ unit: PAGE.unit, format: PAGE.format });
  let y = drawHeader(doc, artistName);
  y = drawTitle(doc, note.title, y);
  const updated = new Date(note.updatedAt);
  const meta = [...context];
  if (!Number.isNaN(updated.getTime())) meta.push(`Actualizada: ${updated.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}`);
  y = drawMeta(doc, meta, y);
  await drawBody(doc, note.content.split("\n"), y, images);
  drawFooter(doc, artistName, now);
  return doc;
}

export const pdfFilename = (title: string) => slugFilename(title, "pdf");

/** Builds and downloads in one call. Throws when jsPDF can't render. */
export async function downloadNotePdf(args: BuildNotePdfArgs) {
  const doc = await buildNotePdf(args);
  doc.save(pdfFilename(args.note.title));
}
