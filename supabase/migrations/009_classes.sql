-- Clases: a group is a class she teaches (its schedule is an
-- event_series), students are contacts enrolled in it, attendance is
-- one row per student per session (an events row of kind 'class'), and
-- tuition is a recurring income rule per enrollment so each student's
-- monthly sale lands in "Por cobrar" and in their balance.

create table public.class_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  series_id uuid references public.event_series(id) on delete set null,
  tuition_amount numeric(12,2) check (tuition_amount is null or tuition_amount >= 0),
  tuition_cadence text not null default 'monthly'
    check (tuition_cadence in ('monthly','per_session')),
  capacity int check (capacity is null or capacity > 0),
  location text not null default '',
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index class_groups_workspace_idx on public.class_groups(workspace_id);
create trigger trg_class_groups_updated_at before update on public.class_groups
  for each row execute function public.set_updated_at();
alter table public.class_groups enable row level security;
create policy "workspace class_groups" on public.class_groups for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

create table public.class_enrollments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id uuid not null references public.class_groups(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  started_on date not null,
  ended_on date,
  -- The monthly tuition rule for this student; `set null` keeps the
  -- enrollment if the rule is deleted from Recurrentes.
  recurring_rule_id uuid references public.recurring_rules(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, contact_id)
);
create index class_enrollments_workspace_idx on public.class_enrollments(workspace_id);
create index class_enrollments_group_idx on public.class_enrollments(group_id);
create trigger trg_class_enrollments_updated_at before update on public.class_enrollments
  for each row execute function public.set_updated_at();
alter table public.class_enrollments enable row level security;
create policy "workspace class_enrollments" on public.class_enrollments for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status text not null default 'present' check (status in ('present','absent','excused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, contact_id)
);
create index attendance_workspace_idx on public.attendance(workspace_id);
create index attendance_event_idx on public.attendance(event_id);
create trigger trg_attendance_updated_at before update on public.attendance
  for each row execute function public.set_updated_at();
alter table public.attendance enable row level security;
create policy "workspace attendance" on public.attendance for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

-- Back-links so a rule or a series knows which class it belongs to.
alter table public.recurring_rules
  add column group_id uuid references public.class_groups(id) on delete set null;
alter table public.event_series
  add column group_id uuid references public.class_groups(id) on delete set null;
