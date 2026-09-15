// Fails the build if a server-only secret ever reaches the browser bundle.
//
// The Supabase secret key (sb_secret_…) bypasses RLS completely: in the
// bundle it would let anyone read and write every workspace's data. Vite
// inlines any env var prefixed VITE_, so one careless rename is all it
// takes. This scans the built output and exits non-zero on a hit.
//
//   node scripts/check-bundle-secrets.mjs [distDir]
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

// R2 keys have no recognizable prefix, so when the build environment
// holds them (Vercel does) scan for their literal values too.
for (const name of ["R2_SECRET_ACCESS_KEY", "R2_ACCESS_KEY_ID"]) {
  const value = process.env[name];
  if (value && value.length >= 16) {
    PATTERNS.push({ name, re: new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
  }
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
}

if (findings.length) {
  console.error("SECRET LEAKED INTO THE BUNDLE:\n" + findings.map((f) => "  " + f).join("\n"));
  console.error("\nServer-only secrets must never be exposed through a VITE_ variable.");
  process.exit(1);
}
console.log(`No secrets in ./${dist} (${files.length} files scanned).`);
