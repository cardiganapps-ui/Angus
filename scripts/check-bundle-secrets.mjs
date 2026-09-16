// Fails the build if a server-only secret ever reaches the browser bundle.
//
// The Supabase secret key (sb_secret_…) bypasses RLS completely: in the
// bundle it would let anyone read and write every workspace's data. Vite
// inlines any env var prefixed VITE_, so one careless rename is all it
// takes. This scans the built output and exits non-zero on a hit.
//
//   node scripts/check-bundle-secrets.mjs [distDir]
//
// The plaintext patterns below could not see the form the key is most
// often issued in. A legacy Supabase service_role key is a JWT, and a
// JWT's payload is base64url — so the literal `"role":"service_role"`
// NEVER appears in it. The guard that was meant to be the last line of
// defence could not fire on the thing it names. Two layers were added:
// every JWT-shaped string is decoded and its claims inspected, and the
// dangerous claim is also searched for in its encoded form.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const dist = process.argv[2] || "dist";

const PATTERNS = [
  { name: "Supabase secret key", re: /sb_secret_[A-Za-z0-9_-]+/ },
  { name: "Supabase service_role JWT", re: /"role"\s*:\s*"service_role"/ },
  { name: "service_role literal", re: /service_role/ },
  { name: "Supabase management token", re: /sbp_[A-Za-z0-9]{20,}/ },
  { name: "Vercel token", re: /\bv(ck|cp)_[A-Za-z0-9]{20,}/ },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}/ }
];

/* Base64 shifts the bit boundary by the byte offset it starts at, so a
   string buried in a larger blob encodes three different ways depending
   on its alignment. Encode it at each of the three, then trim four
   characters off each end: those are the ones whose bits are shared
   with the surrounding bytes. What's left is a stable core that appears
   verbatim whatever precedes it — which is what lets this match a
   claim inside an opaque payload, JWT or not. */
function base64Needles(literal) {
  const out = new Set();
  for (let offset = 0; offset < 3; offset++) {
    const padded = Buffer.concat([Buffer.alloc(offset, 0x41), Buffer.from(literal, "utf8")]);
    const core = padded.toString("base64").replace(/=+$/, "").slice(4, -4);
    if (core.length >= 12) {
      out.add(core);
      // base64url only differs in two characters; emit both spellings.
      out.add(core.replace(/\+/g, "-").replace(/\//g, "_"));
    }
  }
  return [...out];
}

for (const needle of base64Needles('"role":"service_role"')) {
  PATTERNS.push({
    name: "service_role claim, base64-encoded",
    re: new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  });
}

// R2 keys have no recognizable prefix, so when the build environment
// holds them (Vercel does) scan for their literal values too.
for (const name of ["R2_SECRET_ACCESS_KEY", "R2_ACCESS_KEY_ID"]) {
  const value = process.env[name];
  if (value && value.length >= 16) {
    PATTERNS.push({ name, re: new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
  }
}

/* The anon/publishable key is SUPPOSED to be here, and in a legacy
   project it is a JWT too — so the shape alone proves nothing and
   flagging it would be a false positive on the one credential that
   belongs in the bundle. The claims are what separate them: `anon` and
   `authenticated` are the browser's roles, everything below bypasses
   RLS or speaks to the Auth Admin API. */
const JWT_RE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}/g;
const DANGEROUS_ROLES = new Set(["service_role", "postgres", "supabase_admin"]);

function dangerousClaim(payload) {
  const role = typeof payload.role === "string" ? payload.role : null;
  if (role && (DANGEROUS_ROLES.has(role) || role.endsWith("_admin"))) return `role: ${role}`;
  return null;
}

function jwtFindings(text) {
  const out = [];
  for (const [token] of text.matchAll(JWT_RE)) {
    const body = token.split(".")[1];
    let payload;
    try {
      const json = Buffer.from(body, "base64url").toString("utf8");
      if (!json.startsWith("{")) continue;
      payload = JSON.parse(json);
    } catch {
      // Not every eyJ… run is a JWT; anything that doesn't decode to a
      // JSON object is somebody's minified string, not a credential.
      continue;
    }
    if (!payload || typeof payload !== "object") continue;
    const reason = dangerousClaim(payload);
    if (reason) out.push({ name: `privileged JWT (${reason})`, hit: token });
  }
  return out;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

let files;
try {
  files = walk(dist);
} catch {
  console.error(`No build output at ./${dist} — run \`npm run build\` first.`);
  process.exit(2);
}

const findings = [];
for (const file of files) {
  if (!/\.(js|css|html|json|webmanifest|map)$/.test(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const { name, re } of PATTERNS) {
    const hit = text.match(re);
    if (hit) findings.push(`${file}: ${name} (${hit[0].slice(0, 12)}…)`);
  }
  for (const { name, hit } of jwtFindings(text)) {
    findings.push(`${file}: ${name} (${hit.slice(0, 12)}…)`);
  }
}

if (findings.length) {
  console.error("SECRET LEAKED INTO THE BUNDLE:\n" + findings.map((f) => "  " + f).join("\n"));
  console.error("\nServer-only secrets must never be exposed through a VITE_ variable.");
  process.exit(1);
}
console.log(`No secrets in ./${dist} (${files.length} files scanned).`);
