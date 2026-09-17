-- 023_ops_backup
--
-- The ledger the nightly backup writes to, and the one question the app
-- can ask about it.
--
-- The backup runs on a GitHub runner that fetches its credentials from
-- the `backup-secrets` edge function (supabase/functions/backup-secrets)
-- by proving itself with a GitHub OIDC token. That function records
-- every issuance and every completion report here. `backup_status()`
-- turns the ledger into "when did the last one succeed" for the admin
-- account, because a backup that quietly stops is the failure mode that
-- loses the data — the job being red on GitHub only helps if someone is
-- looking at GitHub.
--
-- `ops` is deliberately NOT an exposed API schema: nothing in it is
-- reachable over PostgREST. The only door is the function below, and it
-- is closed to everyone but the admin.

create schema if not exists ops;

create table if not exists ops.backup_events (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  kind       text not null check (kind in ('issued', 'completed', 'failed')),
  actor      text,
  run_id     text,
  git_ref    text,
  workflow   text,
  detail     jsonb not null default '{}'::jsonb
);

create index if not exists backup_events_kind_at_idx on ops.backup_events (kind, at desc);

alter table ops.backup_events enable row level security;
-- No policies on purpose: only `postgres` (the edge function's
-- connection) reads or writes it, and RLS does not apply to the owner.
revoke all on schema ops from public, anon, authenticated;
revoke all on ops.backup_events from public, anon, authenticated;

-- What the admin's Ajustes → Diagnóstico shows. Definer so it can read
-- `ops` on the caller's behalf; the is_admin() gate is the whole
-- authorization, and search_path is pinned for the same reason it is on
-- is_admin (migration 018).
create or replace function public.backup_status()
returns jsonb
language sql
stable
security definer
set search_path = public, ops, pg_temp
as $$
  select case
    when not public.is_admin() then null
    else jsonb_build_object(
      'last_completed', (select max(at) from ops.backup_events where kind = 'completed'),
      'last_failed',    (select max(at) from ops.backup_events where kind = 'failed'),
      'last_issued',    (select max(at) from ops.backup_events where kind = 'issued'),
      'last_detail',    (select detail from ops.backup_events
                          where kind in ('completed', 'failed')
                          order by at desc limit 1)
    )
  end
$$;

revoke execute on function public.backup_status() from public, anon;
grant execute on function public.backup_status() to authenticated;
