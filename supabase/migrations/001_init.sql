-- Angus v1 schema: contacts, projects, events. Every row is owned by a
-- user (RLS: auth.uid() = user_id). Keep the check constraints in sync
-- with src/data/constants.ts.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- contacts -----------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  relationship text not null default 'lead'
    check (relationship in ('lead','client','gallery','supplier','collaborator','other')),
  email text not null default '',
  phone text not null default '',
  lead_stage text
    check (lead_stage is null or lead_stage in ('new','contacted','negotiating','won','lost')),
  follow_up_date date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_user_id_idx on public.contacts(user_id);
create trigger trg_contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

-- projects -----------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  medium text not null default '',
  status text not null default 'idea'
    check (status in ('idea','in_progress','on_hold','completed')),
  start_date date,
  due_date date,
  price numeric(12,2),
  contact_id uuid references public.contacts(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_user_id_idx on public.projects(user_id);
create trigger trg_projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- events -------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  kind text not null default 'other'
    check (kind in ('class','expo','meeting','deadline','personal','other')),
  date date not null,
  start_time time,
  end_time time,
  location text not null default '',
  project_id uuid references public.projects(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index events_user_id_date_idx on public.events(user_id, date);
create trigger trg_events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

-- RLS ----------------------------------------------------------------------
alter table public.contacts enable row level security;
alter table public.projects enable row level security;
alter table public.events enable row level security;

create policy "own contacts" on public.contacts
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own projects" on public.projects
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own events" on public.events
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
