#!/usr/bin/env node
/* ── Bundle budget ──
   Nothing in this repo used to notice a chunk growing. The entry bundle
   had reached 902 KiB and the service worker was precaching 2.7 MiB —
   including the two lazy chunks that exist to stay off the critical
   path — and no check said a word.

   These are ceilings with deliberate headroom, not targets. They exist
   to make a REGRESSION loud, so raising one should be a decision
   somebody writes down, not a reflex when CI turns red.

   Run after `vite build`; `npm run build` does it for you.
*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = process.argv[2] || "dist";

/* Measured at the time of writing, with room to breathe:
     entry   306 KiB  -> 420
     css     139 KiB  -> 200
     precache 1167 KiB -> 1500  (includes the four woff2 faces)  */
const BUDGETS = {
  entryKiB: 420,
  cssKiB: 200,
  precacheKiB: 1500
};

/* These must never be precached: they are lazy on purpose (a HEIC
   transcoder for a photo she may never upload, a PDF writer for a note
   she may never export). Precaching them was the original inversion. */
const NEVER_PRECACHED = [/heic2any/, /notePdf/];

const kib = (bytes) => Math.round(bytes / 1024);
const problems = [];

function assetsDir() {
  try {
    return readdirSync(join(DIST, "assets"));
  } catch {
    console.error(`✗ ${DIST}/assets not found — run the build first.`);
    process.exit(2);
  }
}

const files = assetsDir();

const entry = files.filter((f) => /^index-.*\.js$/.test(f));
if (entry.length !== 1) {
  problems.push(`expected exactly one entry chunk, found ${entry.length}: ${entry.join(", ") || "none"}`);
} else {
  const size = kib(statSync(join(DIST, "assets", entry[0])).size);
  console.log(`  entry    ${String(size).padStart(5)} KiB  (budget ${BUDGETS.entryKiB})`);
  if (size > BUDGETS.entryKiB) problems.push(`entry chunk ${size} KiB exceeds ${BUDGETS.entryKiB} KiB`);
}

const css = files.filter((f) => f.endsWith(".css"));
const cssSize = css.reduce((n, f) => n + statSync(join(DIST, "assets", f)).size, 0);
console.log(`  css      ${String(kib(cssSize)).padStart(5)} KiB  (budget ${BUDGETS.cssKiB})`);
if (kib(cssSize) > BUDGETS.cssKiB) problems.push(`css ${kib(cssSize)} KiB exceeds ${BUDGETS.cssKiB} KiB`);

/* The precache manifest is inlined in sw.js as url:"…" pairs. Summing
   the real files it names is the only honest measure of what a first
   visit — and every update — actually downloads. */
let sw = "";
try {
  sw = readFileSync(join(DIST, "sw.js"), "utf8");
} catch {
  problems.push("sw.js not found — the PWA plugin did not run");
}

if (sw) {
  const urls = [...new Set([...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]))];
  let total = 0;
  const missing = [];
  for (const url of urls) {
    try {
      total += statSync(join(DIST, url)).size;
    } catch {
      missing.push(url);
    }
  }
  console.log(`  precache ${String(kib(total)).padStart(5)} KiB  (budget ${BUDGETS.precacheKiB}, ${urls.length} entries)`);
  if (kib(total) > BUDGETS.precacheKiB) {
    problems.push(`precache ${kib(total)} KiB exceeds ${BUDGETS.precacheKiB} KiB`);
  }
  if (missing.length) problems.push(`precache names files that do not exist: ${missing.join(", ")}`);

  for (const pattern of NEVER_PRECACHED) {
    const hit = urls.find((u) => pattern.test(u));
    if (hit) problems.push(`${hit} must stay OUT of the precache (it is lazy on purpose)`);
  }

  // The fonts are the thing she actually needs offline.
  if (!urls.some((u) => u.endsWith(".woff2"))) {
    problems.push("no woff2 in the precache — offline loads would have no webfonts");
  }
}

if (problems.length) {
  console.error("\n✗ bundle budget");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("\nIf the growth is intended, raise the budget in this file in the same commit.");
  process.exit(1);
}
console.log("✓ bundle within budget");
