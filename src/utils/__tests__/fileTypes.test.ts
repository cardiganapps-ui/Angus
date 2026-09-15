import { describe, expect, it } from "vitest";
import { extensionFor, formatFileSize, isImageMime, isPdfMime, resolveMime } from "../fileTypes";

describe("resolveMime", () => {
  it("keeps an accepted declared type", () => {
    expect(resolveMime("image/png", "foto.png")).toBe("image/png");
    expect(resolveMime("application/pdf", "lectura.pdf")).toBe("application/pdf");
  });
  it("falls back to the extension when the browser gives none or something odd", () => {
    expect(resolveMime("", "IMG_0001.JPEG")).toBe("image/jpeg");
    expect(resolveMime("application/octet-stream", "apuntes.docx")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(resolveMime("", "foto.HEIC")).toBe("image/heic");
  });
  it("refuses what we don't serve", () => {
    expect(resolveMime("text/html", "page.html")).toBe("");
    expect(resolveMime("image/svg+xml", "logo.svg")).toBe("");
    expect(resolveMime("", "sin-extension")).toBe("");
  });
});

describe("extensionFor / kinds / sizes", () => {
  it("maps types to extensions with a safe default", () => {
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("text/markdown")).toBe("md");
    expect(extensionFor("application/x-unknown")).toBe("bin");
  });
  it("classifies images and PDFs", () => {
    expect(isImageMime("image/webp")).toBe(true);
    expect(isImageMime("application/pdf")).toBe(false);
    expect(isPdfMime("application/pdf")).toBe(true);
  });
  it("reads sizes the way she would say them", () => {
    expect(formatFileSize(0)).toBe("");
    expect(formatFileSize(null)).toBe("");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(24 * 1024)).toBe("24 KB");
    expect(formatFileSize(3.25 * 1024 * 1024)).toBe("3.3 MB");
  });
});
