-- Angus is a two-person tool whose database holds one artist's entire
-- business memory, and "Crear cuenta" was a public button. With
-- mailer_autoconfirm on, any stranger got a confirmed session and
-- handle_new_user provisioned them a workspace in her project.
--
-- There were TWO doors, not one: signUp(), and signInWithOtp() without
-- shouldCreateUser: false, which creates an account by default. So the
-- gate cannot live in the UI — the anon key ships in the browser bundle
-- and anyone can call either method directly. It lives here.
--
-- The invite code in AuthScreen is convenience, not security. This is
-- the security.

create table public.allowed_signups (
  email text primary key,
  note text not null default '',
  created_at timestamptz not null default now()
);

-- Not workspace-scoped and never read by the client: no policy, RLS on,
-- so PostgREST exposes nothing. The trigger below is security definer
-- and reads it regardless.
alter table public.allowed_signups enable row level security;

insert into public.allowed_signups (email, note) values
  ('gaxioladiego@gmail.com', 'admin'),
  ('andrea.garza.hugues@gmail.com', 'la artista')
on conflict (email) do nothing;

-- Emails are compared lower-cased and trimmed: Supabase stores them
-- normalized, but an allowlist that disagrees with its own comparison
-- is a lock that opens for the wrong key.
create or replace function public.enforce_signup_allowlist()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from public.allowed_signups
    where email = lower(btrim(new.email))
  ) then
    raise exception 'signup_not_allowed' using errcode = '42501';
  end if;
  return new;
end $$;

-- BEFORE INSERT, so a rejected signup creates no user row at all and
-- on_auth_user_created never fires — no orphan workspace to clean up.
drop trigger if exists on_auth_user_signup_allowlist on auth.users;
create trigger on_auth_user_signup_allowlist
  before insert on auth.users
  for each row execute function public.enforce_signup_allowlist();
