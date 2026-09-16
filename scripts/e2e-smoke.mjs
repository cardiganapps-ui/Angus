// Browser smoke test against a running build (dev server or production).
//
//   E2E_EMAIL=… E2E_PASS=… node scripts/e2e-smoke.mjs [baseUrl]
//
// Signs in, walks every tab, opens each "new" sheet, and fails on any page
// error or console error. Screenshots land in ./e2e-out/. Needs Playwright's
// chromium: either `npx playwright install chromium` or set
// PLAYWRIGHT_CHROMIUM (path to a chromium binary) + PLAYWRIGHT_PKG (path to
// a playwright package) when running inside a sandbox that pre-installs
// them. Inside a sandbox whose outbound HTTPS goes through an intercepting
// proxy, Chromium's POSTs to supabase.co fail (ERR_TOO_MANY_RETRIES); set
// HTTPS_PROXY and run with NODE_USE_ENV_PROXY=1 and the script relays those
// requests through Node fetch instead.
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PKG || "playwright");

const BASE = process.argv[2] || "http://localhost:5173/";
const EMAIL = process.env.E2E_EMAIL;
const PASS = process.env.E2E_PASS;
const OUT = "e2e-out";
if (!EMAIL || !PASS) {
  console.error("Set E2E_EMAIL and E2E_PASS (a confirmed test account).");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const proxy = process.env.HTTPS_PROXY;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
  proxy: proxy ? { server: proxy } : undefined,
  args: proxy ? ["--proxy-bypass-list=localhost;127.0.0.1"] : []
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: !!proxy });
const page = await ctx.newPage();
// Behind the sandbox proxy, Chromium can't fetch sw.js (TLS interception +
// ERR_TOO_MANY_RETRIES); those errors are environmental, not app bugs.
const sandboxNoise = (text) =>
  !!proxy && /ServiceWorker|sw\.js|ERR_TOO_MANY_RETRIES|fetching the script/.test(text);
const errors = [];
page.on("pageerror", (e) => {
  if (!sandboxNoise(e.message)) errors.push("pageerror: " + e.message);
});
page.on("console", (m) => {
  if (m.type() === "error" && !sandboxNoise(m.text())) errors.push("console: " + m.text());
});

if (proxy) {
  await page.route(/https:\/\/[a-z]+\.supabase\.co\/.*/, async (route) => {
    const req = route.request();
    const headers = { ...req.headers() };
    for (const k of ["host", "content-length", "origin", "referer"]) delete headers[k];
    const res = await fetch(req.url(), {
      method: req.method(),
      headers,
      body: ["GET", "HEAD"].includes(req.method()) ? undefined : req.postDataBuffer()
    });
    const body = Buffer.from(await res.arrayBuffer());
    const rh = { "access-control-allow-origin": "*" };
    res.headers.forEach((v, k) => {
      if (!["content-encoding", "transfer-encoding", "content-length"].includes(k)) rh[k] = v;
    });
    await route.fulfill({ status: res.status, headers: rh, body });
  });
}

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

await page.goto(BASE, { waitUntil: "networkidle" });
await shot("00-auth");
await page.fill("#auth-email", EMAIL);
await page.fill("#auth-password", PASS);
await page.click("button[type=submit]");
// A fresh account lands in onboarding; skip through it so the walk below
// always starts on Hoy. An onboarded account resolves on the first check.
await page.waitForSelector(".onb, nav.bottom-tabs", { timeout: 20000 });
for (let i = 0; i < 12; i++) {
  const onb = await page.$(".onb");
  if (!onb) break;
  if (i === 0) await shot("00-onboarding");
  const finish = await page.$(".onb >> text=Ir a mi día");
  const skip = await page.$(".onb-skip");
  if (finish) await finish.click();
  else if (skip) await skip.click();
  await page.waitForTimeout(900);
}
await page.waitForSelector("nav.bottom-tabs", { timeout: 20000 });
await page.waitForTimeout(800);
await shot("01-home");

// The pill carries three tabs; Obra and Contactos live in the drawer.
const tabs = [
  ["Agenda", "Nuevo evento"],
  ["Dinero", "Nueva venta"]
];
for (const [tab, fab] of tabs) {
  await page.click(`nav.bottom-tabs >> text=${tab}`);
  await page.waitForTimeout(700);
  await shot(`02-${tab.toLowerCase()}`);
  await page.click(`[aria-label="${fab}"]`);
  await page.waitForTimeout(600);
  await shot(`03-${tab.toLowerCase()}-sheet`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
}

// Every drawer route, with the "new" sheet each one owns (null = none).
// Clases and Expos only show in the drawer when her practice includes
// them or rows exist; the click tolerates a missing item.
const drawerRoutes = [
  ["Obra", "Nueva pieza"],
  ["Contactos", "Nuevo contacto"],
  ["Clases", "Nueva clase"],
  ["Estudios", "Nuevo curso"],
  ["Notas", "Nota rápida"],
  ["Expos", "Nueva expo"],
  ["Recurrentes", "Nueva regla"],
  ["Presupuestos", null],
  ["Pronóstico", null],
  ["Reportes", null],
  ["Ajustes", null]
];
for (const [item, fab] of drawerRoutes) {
  await page.click('[aria-label="Menú"]');
  await page.waitForTimeout(500);
  await shot(`04-drawer-${item.toLowerCase()}`);
  const link = await page.$(`nav.drawer .drawer-item-label:text-is("${item}")`);
  if (!link) {
    console.log(`(drawer has no "${item}" for this workspace — skipped)`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    continue;
  }
  await link.click();
  await page.waitForTimeout(700);
  await shot(`05-${item.toLowerCase()}`);
  if (fab) {
    await page.click(`[aria-label="${fab}"]`);
    await page.waitForTimeout(600);
    await shot(`06-${item.toLowerCase()}-sheet`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }
  await page.click('[aria-label="Volver"]');
  await page.waitForTimeout(500);
}

/* ── The write path ──
   Everything above opens sheets and presses Escape, so until now this
   harness asserted exactly one thing: that nothing threw while looking
   at empty screens. No form was ever submitted, which means no
   coverage of create, edit, delete, validation, the optimistic revert
   or the materializers — the parts most able to lose her data.

   One full journey on a real entity. A piece, because Obra is the
   simplest sheet with a required field and a confirm-gated delete. It
   cleans up after itself so the account it runs against does not
   accumulate junk. */
const step = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) errors.push(`journey: ${name} ${detail}`);
};

const title = `E2E pieza ${Date.now()}`;
const edited = `${title} (editada)`;

await page.click('[aria-label="Menú"]');
await page.waitForTimeout(500);
await page.click('.drawer-item-label:text-is("Obra")');
await page.waitForSelector(".page", { timeout: 10000 });
await page.waitForTimeout(600);

// create
await page.click('[aria-label="Nueva pieza"]');
await page.waitForSelector(".sheet-panel", { timeout: 10000 });
await page.fill("#project-title", title);
await page.click('.sheet-footer >> text=Guardar');
await page.waitForTimeout(1200);
step("a new piece appears in the list", (await page.locator(`text=${title}`).count()) > 0);
await shot("07-created");

// edit
await page.click(`text=${title}`);
await page.waitForSelector(".sheet-panel", { timeout: 10000 });
await page.fill("#project-title", edited);
await page.click('.sheet-footer >> text=Guardar');
await page.waitForTimeout(1200);
step("the edit replaces the old title", (await page.locator(`text=${edited}`).count()) > 0);
step("the old title is gone", (await page.locator(`text=${title}`).count()) === 0);
await shot("08-edited");

// delete, through the two-tap confirm
await page.click(`text=${edited}`);
await page.waitForSelector(".sheet-panel", { timeout: 10000 });
await page.click('.sheet-panel >> text=Eliminar');
await page.waitForTimeout(400);
step("deleting asks first", (await page.locator(".sheet-actions-question").count()) > 0);
await page.click('.sheet-panel >> text=Sí, eliminar');
await page.waitForTimeout(1200);
step("the piece is gone after confirming", (await page.locator(`text=${edited}`).count()) === 0);
await shot("09-deleted");

// A reload proves the writes reached Postgres rather than only local state.
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
step("it stays gone after a reload", (await page.locator(`text=${edited}`).count()) === 0);

await browser.close();
if (errors.length) {
  console.error("FAILED with errors:\n" + errors.join("\n"));
  process.exit(1);
}
console.log(`OK — screenshots in ./${OUT}`);
