-- Reverses migration 019, which was wrong and broke the live app.
--
-- 019 revoked EXECUTE from PUBLIC on the policy helpers to satisfy the
-- advisor's "Public Can Execute SECURITY DEFINER Function" lint. But an
-- RLS policy expression is evaluated AS THE QUERYING ROLE, and every
-- policy on all 22 tables calls public.is_workspace_member(workspace_id).
-- Revoking from PUBLIC took EXECUTE away from `authenticated`, `anon`
-- and `supabase_auth_admin` in one stroke, because none of them had a
-- direct grant — they all held it through PUBLIC.
--
-- Result, in the Postgres logs within minutes:
--     permission denied for function is_workspace_member
-- Every read and write from the app failed, and GoTrue sign-in returned
-- "Database error querying schema".
--
-- Worse than the mistake was how it got past me. I "verified" 019 by
-- setting request.jwt.claims and calling is_workspace_member() — but I
-- never set the ROLE, so the check ran as `postgres`, which has EXECUTE
-- on everything. The test could not have detected the breakage it was
-- meant to prove absent. A boundary test that does not assume the
-- caller's role is not a boundary test.
--
-- The advisor lint is simply not actionable for a policy helper: the
-- role that needs EXECUTE is exactly the role the lint wants it revoked
-- from. The real fix, if it is ever worth doing, is to move these
-- functions into a schema PostgREST does not expose (`private`) and
-- rewrite all 22 policies to qualify them — which removes the RPC
-- surface without removing the grant. That is a schema-wide change, not
-- a grant tweak, and it is not attempted here.
--
-- Left as-is and documented instead. The exposure it describes is thin:
-- is_workspace_member(uuid) called by anon returns false (auth.uid() is
-- null), is_admin() the same, and the two trigger functions raise
-- without a NEW record.

grant execute on function public.is_admin() to public;
grant execute on function public.is_workspace_member(uuid) to public;
grant execute on function public.is_workspace_admin(uuid) to public;

-- Fires on UPDATE of every workspace table, performed by `authenticated`.
grant execute on function public.set_updated_at() to public;

-- Both fire on auth.users, inserted by GoTrue as `supabase_auth_admin`.
grant execute on function public.handle_new_user() to public;
grant execute on function public.enforce_signup_allowlist() to public;
