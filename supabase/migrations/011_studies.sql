-- Estudios: the courses SHE takes (clases, talleres, maestría,
-- seminarios, diplomados). The teacher-side module (class_groups) stays
-- untouched; this is the student side. A course owns a schedule (an
-- event_series), a cost she pays (an expense rule or one-off expenses),
-- and later assignments, notes and material.

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'class'
    check (kind in ('class','workshop','master','seminar','diploma','online','other')),
  status text not null default 'active'
    check (status in ('upcoming','active','completed','dropped')),
  institution text not null default '',
  teacher_contact_id uuid references public.contacts(id) on delete set null,
  modality text not null default 'in_person'
    check (modality in ('in_person','online','hybrid')),
  location text not null default '',
  url text not null default '',
  start_date date,
  end_date date,
  series_id uuid references public.event_series(id) on delete set null,
  cost numeric(12,2) check (cost is null or cost >= 0),
  payment_plan text not null default 'single'
    check (payment_plan in ('single','monthly','per_session','free')),
  recurring_rule_id uuid references public.recurring_rules(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index courses_workspace_idx on public.courses(workspace_id);
create trigger trg_courses_updated_at before update on public.courses
  for each row execute function public.set_updated_at();
alter table public.courses enable row level security;
create policy "workspace courses" on public.courses for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

-- Links from the rest of the model to a course. All `set null`: deleting
-- a course keeps her expenses, rules, pieces and one-off events; only
-- the series (and with it the generated sessions) goes with it.
alter table public.event_series add column course_id uuid references public.courses(id) on delete set null;
alter table public.events
  add column course_id uuid references public.courses(id) on delete set null,
  add column missed boolean not null default false;
alter table public.expenses add column course_id uuid references public.courses(id) on delete set null;
alter table public.recurring_rules add column course_id uuid references public.courses(id) on delete set null;
alter table public.projects add column course_id uuid references public.courses(id) on delete set null;

create index events_course_idx on public.events(course_id) where course_id is not null;
create index expenses_course_idx on public.expenses(course_id) where course_id is not null;
