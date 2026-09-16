/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

/** Injected by vite.config.ts from package.json — shown in Ajustes → Acerca de. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_API_BASE?: string;
  /** Gate on the "Crear cuenta" form. Convenience, NOT security — this
      ships in the browser bundle. The boundary is the allowlist trigger
      in supabase/migrations/017_signup_allowlist.sql. */
  readonly VITE_INVITE_CODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
