-- Material: files and links that live with a course, a tarea, a piece
-- or a session, plus images attached inside a note (and the note's
-- cover). Bytes live in Cloudflare R2 under ws/<workspace_id>/…; these
-- rows are the index. A document survives whatever it was linked to;
-- a note attachment goes with its note.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'file' check (kind in ('file','link')),
  name text not null,
  r2_path text unique,
  url text,
  mime text not null default '',
  size_bytes integer,
  width integer,
  height integer,
  course_id uuid references public.courses(id) on delete set null,
  assignment_id uuid references public.assignments(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'file' and r2_path is not null) or (kind = 'link' and url is not null))
);
create index documents_workspace_idx on public.documents(workspace_id);
create index documents_course_idx on public.documents(course_id) where course_id is not null;
create index documents_assignment_idx on public.documents(assignment_id) where assignment_id is not null;
create index documents_project_idx on public.documents(project_id) where project_id is not null;
create index documents_event_idx on public.documents(event_id) where event_id is not null;
create trigger trg_documents_updated_at before update on public.documents
  for each row execute function public.set_updated_at();
alter table public.documents enable row level security;
create policy "workspace documents" on public.documents for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

create table public.note_attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note_id uuid not null references public.notes(id) on delete cascade,
  r2_path text not null unique,
  mime text not null,
  size_bytes integer,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index note_attachments_workspace_idx on public.note_attachments(workspace_id);
create index note_attachments_note_idx on public.note_attachments(note_id);
create trigger trg_note_attachments_updated_at before update on public.note_attachments
  for each row execute function public.set_updated_at();
alter table public.note_attachments enable row level security;
create policy "workspace note_attachments" on public.note_attachments for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

alter table public.notes
  add column cover_attachment_id uuid references public.note_attachments(id) on delete set null;
