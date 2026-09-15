// Mirrors public.is_admin() in supabase/migrations/002_workspaces.sql —
// change both together.
export const ADMIN_EMAIL = "gaxioladiego@gmail.com";

export function isAdminEmail(email: string | null | undefined): boolean {
  return (email ?? "").toLowerCase() === ADMIN_EMAIL;
}
