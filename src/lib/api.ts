import { supabase } from "./supabase";

/* ── /api client ──
   The serverless functions (api/) take a POST with a JSON body and the
   caller's Supabase JWT. In production they're same-origin; local dev
   has none, so VITE_API_BASE points at the deployed functions. */

export interface ApiError {
  status: number;
  code: string;
  message: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export async function apiFetch<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  if (isOffline()) return { ok: false, error: { status: 0, code: "offline", message: "Sin conexión" } };
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: { status: 401, code: "unauthorized", message: "Sin sesión" } };
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch {
    return { ok: false, error: { status: 0, code: "network", message: "No se pudo conectar" } };
  }
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  if (!res.ok || json === null) {
    return {
      ok: false,
      error: {
        status: res.status,
        code: (json?.code as string) ?? (json === null ? "api_unavailable" : "error"),
        message: (json?.error as string) ?? "La API no respondió"
      }
    };
  }
  return { ok: true, data: json as T };
}
