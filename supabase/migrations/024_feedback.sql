-- 024_feedback
--
-- What she tells us: a bug, an idea, a question. One row per message,
-- written by api/feedback.ts on her behalf (through a client bound to
-- HER JWT, so RLS applies exactly as it would from the app) and mailed
-- to the admin in the same request. The row is the record; the email is
-- the notification. If the mail ever fails the row is still here.
--
-- Not read by the app today. Workspace-scoped like everything else so
-- it exports with "Descargar todo" and restores with the nightly dump.

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('bug', 'idea', 'question')),   -- mirror FEEDBACK_KINDS in constants.ts
  message text not null check (char_length(message) between 1 and 4000),
  -- Where she was and what the app knew: route, version, viewport,
  -- online, the last few local diagnostics (messages only, never rows —
  -- see lib/diagnostics.ts). Enough to reproduce, nothing to leak.
  context jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'seen', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index feedback_workspace_idx on public.feedback(workspace_id, created_at desc);
create trigger trg_feedback_updated_at before update on public.feedback
  for each row execute function public.set_updated_at();
alter table public.feedback enable row level security;
create policy "workspace feedback" on public.feedback for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
