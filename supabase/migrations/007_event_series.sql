-- Recurring sessions. A series is the rule ("óleo, martes y jueves
-- 17:00, desde el 1 de octubre"); its occurrences are real rows in
-- `events`, one per date, generated ~12 weeks ahead by the client
-- (utils/series.ts + AppContext) under a unique index so two devices
-- can't double-book a date.
--
-- Editing one occurrence marks it `detached` (regeneration leaves it
-- alone); deleting one marks it `cancelled` (the row stays so the slot
-- doesn't come back). Deleting the series cascades every occurrence.

create table public.event_series (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  kind text not null default 'class'
    check (kind in ('class','expo','meeting','deadline','personal','other')),
  cadence text not null check (cadence in ('weekly','biweekly','monthly')),
  -- 0 = domingo … 6 = sábado; for weekly / biweekly. Empty = start_date's weekday.
  weekdays smallint[] not null default '{}',
  start_time time,
  end_time time,
  location text not null default '',
  start_date date not null,
  end_date date,
  project_id uuid references public.projects(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_series_workspace_idx on public.event_series(workspace_id);
create trigger trg_event_series_updated_at before update on public.event_series
  for each row execute function public.set_updated_at();
alter table public.event_series enable row level security;
create policy "workspace event_series" on public.event_series for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

alter table public.events
  add column series_id uuid references public.event_series(id) on delete cascade,
  add column cancelled boolean not null default false,
  add column detached boolean not null default false;

create unique index events_series_date_uidx
  on public.events(series_id, date) where series_id is not null;
