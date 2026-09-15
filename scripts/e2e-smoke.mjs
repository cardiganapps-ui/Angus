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

const drawerRoutes = [
  ["Obra", "Nueva pieza"],
  ["Contactos", "Nuevo contacto"],
  ["Ajustes", null]
];
for (const [item, fab] of drawerRoutes) {
  await page.click('[aria-label="Menú"]');
  await page.waitForTimeout(500);
  await shot(`04-drawer-${item.toLowerCase()}`);
  await page.click(`nav.drawer >> text=${item}`);
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

await browser.close();
if (errors.length) {
  console.error("FAILED with errors:\n" + errors.join("\n"));
  process.exit(1);
}
console.log(`OK — screenshots in ./${OUT}`);
