import { describe, expect, it } from "vitest";
import { summarizeFiles } from "../../lib/exportAll";

describe("summarizeFiles", () => {
  it("counts stored bytes and ignores link documents", () => {
    const summary = summarizeFiles({
      documents: [
        { kind: "file", size_bytes: 1000 },
        { kind: "link", size_bytes: null },
        { kind: "file", size_bytes: null }
      ],
      note_attachments: [{ size_bytes: 500 }]
    });
    expect(summary).toEqual({ count: 3, bytes: 1500 });
  });

  it("reports nothing missing when she has no files", () => {
    expect(summarizeFiles({ documents: [], note_attachments: [] })).toEqual({ count: 0, bytes: 0 });
    expect(summarizeFiles({})).toEqual({ count: 0, bytes: 0 });
  });
});
