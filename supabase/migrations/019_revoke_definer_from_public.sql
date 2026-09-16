-- Correction to 018. Its `revoke all on function ... from anon,
-- authenticated` looked right and did nothing: Postgres grants EXECUTE
-- on a new function to PUBLIC by default, so both roles held it through
-- that grant rather than directly. `pg_proc.proacl` showed
-- `{=X/postgres, postgres=X/postgres, service_role=X/postgres}` — the
-- leading `=X` is PUBLIC — and the advisor still reported all five
-- functions as callable over /rest/v1/rpc/ afterwards.
--
-- Revoking from PUBLIC is what actually removes it. service_role keeps
-- EXECUTE (it bypasses this layer anyway) and so does postgres, which
-- is what triggers and policies run as.
--
-- None of these were ever meant to be RPCs: handle_new_user and
-- enforce_signup_allowlist are triggers, the rest exist for policies to
-- consult. A trigger fires regardless of grants and a policy evaluates
-- as the table owner, so the app loses nothing.

revoke all on function public.handle_new_user() from public;
revoke all on function public.enforce_signup_allowlist() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.is_workspace_admin(uuid) from public;
revoke all on function public.set_updated_at() from public;

-- snapshot_note and search_notes stay callable: the client calls both
-- (useNotes.ts) and they are SECURITY INVOKER, so RLS applies normally.
