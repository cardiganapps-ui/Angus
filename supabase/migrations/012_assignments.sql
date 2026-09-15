-- Tareas: what a course asks of her — homework, entregas, a piece to
-- make. An assignment belongs to its course (cascades with it) and may
-- point at the piece she made for it (kept when the piece goes).

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  description text not null default '',
  due_date date,
  due_time time,
  status text not null default 'todo'
    check (status in ('todo','in_progress','done')),
  completed_at timestamptz,
  project_id uuid references public.projects(id) on delete set null,
  grade text not null default '',
  feedback text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assignments_workspace_idx on public.assignments(workspace_id);
create index assignments_course_due_idx on public.assignments(course_id, due_date);
create trigger trg_assignments_updated_at before update on public.assignments
  for each row execute function public.set_updated_at();
alter table public.assignments enable row level security;
create policy "workspace assignments" on public.assignments for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
