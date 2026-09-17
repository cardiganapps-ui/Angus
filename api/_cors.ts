import type { VercelRequest, VercelResponse } from "@vercel/node";

/* ── CORS ──
   Production calls /api same-origin. Local dev (Vite on :5173, talking
   to the deployed functions through VITE_API_BASE) and Vercel previews
   are cross-origin, so their preflights need these headers. Auth is
   still each handler's JWT check — CORS only lets the request through. */

const STATIC_ALLOWED = new Set([
  "https://angus.cardigan.mx",
  "https://angus-xi.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173"
]);

/* Vercel preview hosts for THIS project look like
   angus-<hash>-<scope>.vercel.app. The old rule accepted any
   *.vercel.app, which is every Vercel user's deployments — not a
   session-riding hole (there is no Allow-Credentials here, and auth is
   a bearer header the attacker's page cannot read) but far wider than
   it needs to be. */
const PREVIEW_HOST = /^angus-[a-z0-9-]+\.vercel\.app$/;

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (STATIC_ALLOWED.has(origin)) return true;
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === "https:" && PREVIEW_HOST.test(hostname);
  } catch {
    return false;
  }
}

/** Sets the CORS headers; returns true when the request is a preflight the caller should end with 204. */
export function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) res.setHeader("Access-Control-Allow-Origin", origin as string);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  return req.method === "OPTIONS";
}
