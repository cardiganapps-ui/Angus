-- Three hardening changes to the workspace security layer. None of them
-- alter who can see what today; they remove ways that could stop being
-- true.
--
-- 1. is_admin() was a string comparison against a hardcoded email:
--
--      select coalesce(auth.jwt() ->> 'email', '') = 'gaxioladiego@...'
--
--    and it short-circuits is_workspace_member() for all 22 tables — so
--    that one literal is functionally a service-role key. Three problems
--    with the shape, none of them exploitable today: privilege came from
--    a JWT CLAIM rather than an identity, revoking it needed a migration,
--    and the SQL compared without lower() while its client mirror
--    (src/config/admin.ts) lowercases. It now reads a table keyed on
--    auth.uid(), which is not a claim a token carries loosely.
--
-- 2. set_updated_at() and is_admin() had a mutable search_path. The newer
--    functions (snapshot_note, search_notes) already pin `public,
--    pg_temp`; these two predate that convention.
--
-- 3. handle_new_user(), is_workspace_member() and is_workspace_admin()
--    are SECURITY DEFINER and were callable by anon and authenticated
--    over /rest/v1/rpc/. Nothing in the app calls them as RPCs — they
--    exist for triggers and for policies to consult. There is not one
--    grant or revoke anywhere in migrations 001-017, so this was
--    unaddressed rather than deliberate.

-- ── platform admins ───────────────────────────────────────────────────
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now()
);

-- Never read by the client: RLS on, no policy, and the only reader is a
-- security-definer function.
alter table public.platform_admins enable row level security;

-- Seeded by address, once, rather than with a literal uuid: the id is
-- environment-specific, the address is what a human recognises.
insert into public.platform_admins (user_id, note)
select id, 'owner' from auth.users where email = 'gaxioladiego@gmail.com'
on conflict (user_id) do nothing;

/* SECURITY DEFINER so it can read platform_admins from inside the
   policies, and so it does not depend on that table being readable by
   anyone. `stable` keeps it out of the per-row re-evaluation the
   auth_rls_initplan advisor warns about. */
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid())
$$;

-- ── pin the two remaining mutable search paths ────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── stop exposing the definer helpers as RPCs ─────────────────────────
-- A trigger fires regardless of grants, and a policy consults these as
-- the table owner, so revoking EXECUTE costs the app nothing.
revoke all on function public.handle_new_user() from anon, authenticated;
revoke all on function public.is_workspace_member(uuid) from anon, authenticated;
revoke all on function public.is_workspace_admin(uuid) from anon, authenticated;
revoke all on function public.is_admin() from anon, authenticated;
revoke all on function public.set_updated_at() from anon, authenticated;
revoke all on function public.enforce_signup_allowlist() from anon, authenticated;

-- ── the foreign keys that actually matter ─────────────────────────────
-- Not all 43 the advisor lists: ~20 are user_id columns nothing ever
-- queries by, and indexing them to silence a linter is cargo cult.
-- These four are on real paths. The two `cascade` ones fire on every
-- contact delete — and ContactSheet's confirm text explicitly promises
-- "su asistencia a clases se borra", so that is a hot path that was
-- doing a sequential scan.
create index if not exists attendance_contact_idx on public.attendance(contact_id);
create index if not exists class_enrollments_contact_idx on public.class_enrollments(contact_id);
create index if not exists workspaces_owner_idx on public.workspaces(owner_id);
create index if not exists courses_teacher_contact_idx
  on public.courses(teacher_contact_id) where teacher_contact_id is not null;
