import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

/* scripts/check-bundle-secrets.mjs is the last thing standing between a
   service-role key and every workspace's data — and nothing tested it,
   which is exactly how it came to be unable to match that key in the
   form Supabase actually issues it. A legacy service_role key is a JWT;
   its payload is base64url, so the literal `"role":"service_role"` the
   script looked for is never present in one.

   This drives the real script as a child process rather than importing
   its internals, because the exit code IS the contract: `npm run build`
   ends with it and CI runs `npm run build`. A guard that finds the key
   and still exits 0 stops nothing. */

const SCRIPT = fileURLToPath(new URL("../../../scripts/check-bundle-secrets.mjs", import.meta.url));

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** Shaped like the real thing: three base64url segments, Supabase's claim set. */
function fakeJwt(role: string): string {
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({ iss: "supabase", ref: "xbpvqvlomrnuxydyqyqj", role, iat: 1_758_000_000, exp: 2_073_576_000 });
  const signature = Buffer.from(`signature-for-${role}-not-a-real-one`).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

let dir: string | null = null;

/** Writes `contents` as a fake bundle and returns what the scanner did with it. */
function scan(contents: string, name = "assets/index-abc123.js"): { code: number; output: string } {
  dir = mkdtempSync(join(tmpdir(), "angus-bundle-"));
  const file = join(dir, name);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, contents, "utf8");
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, dir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, output: stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe("the bundle scanner catches a service_role key", () => {
  it("catches it as a JWT, where the claim is only ever base64", () => {
    const jwt = fakeJwt("service_role");
    // The gap this test exists for: the plaintext pattern cannot see it.
    expect(jwt).not.toMatch(/service_role/);

    const { code, output } = scan(`const k="${jwt}";export default k;`);
    expect(code).toBe(1);
    expect(output).toContain("SECRET LEAKED INTO THE BUNDLE");
    expect(output).toContain("service_role");
  });

  it("catches the claim inside any payload, at every base64 alignment", () => {
    // Not a JWT — an opaque blob. The byte offset the claim starts at
    // decides which of three encodings it takes; all three must hit.
    for (const pad of ["", "x", "xx", "xxx"]) {
      const blob = Buffer.from(JSON.stringify({ pad, role: "service_role" })).toString("base64url");
      expect(scan(`self.__cfg="${blob}";`).code).toBe(1);
    }
  });

  it("still catches the plaintext forms it always did", () => {
    expect(scan('const k="sb_secret_9tZq3xKp1LmN7vRs2wYb4c";').code).toBe(1);
    expect(scan('const k={"role":"service_role"};').code).toBe(1);
    expect(scan('const t="sbp_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";').code).toBe(1);
  });
});

describe("the bundle scanner leaves a legitimate bundle alone", () => {
  it("passes the key that is supposed to ship", () => {
    // Both spellings of the browser credential: the publishable key and
    // the legacy anon JWT. Flagging either would fail every build.
    const anon = fakeJwt("anon");
    const { code, output } = scan(`const url="https://x.supabase.co",key="${anon}",pk="sb_publishable_7hJk2mNp4qRs";`);
    expect(code).toBe(0);
    expect(output).toContain("No secrets");
  });

  it("passes an authenticated user's token", () => {
    expect(scan(`const session={access_token:"${fakeJwt("authenticated")}"};`).code).toBe(0);
  });

  it("does not choke on minified strings that merely start like a JWT", () => {
    // `eyJ` is just base64 for `{"`; minified code is full of near-misses.
    const noise = "eyJhbGciOiJIUzI1NiJ9.notbase64json.sig eyJub3RfanNvbg.aaaaaaaaaaaa.bbbbbbbb";
    expect(scan(`const s="${noise}";`).code).toBe(0);
  });

  it("reports a missing build instead of passing silently", () => {
    dir = mkdtempSync(join(tmpdir(), "angus-bundle-"));
    let code = 0;
    try {
      execFileSync(process.execPath, [SCRIPT, join(dir, "nope")], { stdio: "ignore" });
    } catch (err) {
      code = (err as { status?: number }).status ?? -1;
    }
    expect(code).toBe(2);
  });
});
