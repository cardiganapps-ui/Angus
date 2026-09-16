import { describe, expect, it } from "vitest";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, parsePath } from "../../../api/_r2";

/* api/ is not in the vitest include glob, so these reach across on
   purpose: parsePath decides what object keys can be signed, and until
   now the only thing exercising it was scripts/r2-smoke.mjs, which needs
   R2 credentials and a deployment and therefore never runs in CI.

   The tenant boundary does NOT rest on this function — isWorkspaceMember
   does, and that needs a database. What rests here is the shape
   CLAUDE.md documents, which for a long time it did not enforce. */

const WS = "11111111-2222-3333-4444-555555555555";
const FILE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("parsePath accepts the documented shape", () => {
  it("takes ws/<uuid>/<folder>/<uuid>.<ext> and reports both parts", () => {
    expect(parsePath(`ws/${WS}/misc/${FILE}.txt`)).toEqual({ workspaceId: WS, folder: "misc" });
  });

  it("accepts every folder the app writes to", () => {
    for (const folder of ["cursos", "tareas", "piezas", "sesiones", "notas", "misc"]) {
      expect(parsePath(`ws/${WS}/${folder}/${FILE}.jpg`)).toMatchObject({ folder });
    }
  });

  it("lower-cases the workspace id so membership compares cleanly", () => {
    expect(parsePath(`ws/${WS.toUpperCase()}/misc/${FILE}.txt`)?.workspaceId).toBe(WS);
  });
});

describe("parsePath rejects everything else", () => {
  const rejected: [string, unknown][] = [
    ["traversal", "ws/../etc/passwd"],
    ["traversal mid-path", `ws/${WS}/misc/../../${FILE}.txt`],
    ["a double slash", `ws/${WS}//misc/${FILE}.txt`],
    ["a backslash", `ws/${WS}\\misc\\${FILE}.txt`],
    ["a folder outside the allowlist", `ws/${WS}/secretos/${FILE}.txt`],
    ["a folder that only looks right", `ws/${WS}/miscx/${FILE}.txt`],
    ["a readable filename instead of a uuid", `ws/${WS}/misc/notas-de-andrea.txt`],
    ["no extension", `ws/${WS}/misc/${FILE}`],
    ["an absurd extension", `ws/${WS}/misc/${FILE}.thisisnotanextension`],
    ["a nested folder", `ws/${WS}/misc/sub/${FILE}.txt`],
    ["a missing workspace segment", `ws/misc/${FILE}.txt`],
    ["a workspace id that is not a uuid", `ws/not-a-uuid-at-all-but-36-chars-xx/misc/${FILE}.txt`],
    ["another prefix entirely", `wsx/${WS}/misc/${FILE}.txt`],
    ["an empty string", ""],
    ["a non-string", 42],
    ["null", null],
    ["undefined", undefined],
    ["an object", { path: `ws/${WS}/misc/${FILE}.txt` }]
  ];

  for (const [name, value] of rejected) {
    it(`rejects ${name}`, () => {
      expect(parsePath(value)).toBeNull();
    });
  }

  it("rejects a path long enough to be an attack on the key space", () => {
    expect(parsePath(`ws/${WS}/misc/${FILE}.${"a".repeat(600)}`)).toBeNull();
  });
});

describe("upload guards", () => {
  /* The client cap in src/lib/files.ts is advisory once a URL is issued
     — the presigned URL IS the capability — so the two must agree. */
  it("caps an upload at the same 25 MB the client enforces", () => {
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
  });

  it("serves no type a browser would execute", () => {
    for (const bad of ["text/html", "image/svg+xml", "application/javascript", "application/xhtml+xml"]) {
      expect(ALLOWED_UPLOAD_TYPES.has(bad)).toBe(false);
    }
  });

  it("still allows the types the app actually uploads", () => {
    for (const ok of ["image/jpeg", "image/png", "image/heic", "application/pdf", "text/plain"]) {
      expect(ALLOWED_UPLOAD_TYPES.has(ok)).toBe(true);
    }
  });
});
