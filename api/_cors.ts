import type { VercelRequest, VercelResponse } from "@vercel/node";

/* ── CORS ──
   Production calls /api same-origin. Local dev (Vite on :5173, talking
   to the deployed functions through VITE_API_BASE) and Vercel previews
   are cross-origin, so their preflights need these headers. Auth is
   still each handler's JWT check — CORS only lets the request through. */

const STATIC_ALLOWED = new Set(["https://angus-xi.vercel.app", "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"]);

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (STATIC_ALLOWED.has(origin)) return true;
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === "https:" && hostname.endsWith(".vercel.app");
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
