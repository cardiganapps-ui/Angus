-- Notas: her apuntes, linked (or not) to a course, a session, a tarea
-- or a piece. Plaintext markdown, full-text searchable in Spanish,
-- tagged, and versioned (one snapshot per "thought", capped at 50).
-- Deleting what a note points at unlinks it; a note never cascades
-- away with anything but its own workspace.

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '',
  content text not null default '',
  pinned boolean not null default false,
  course_id uuid references public.courses(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  assignment_id uuid references public.assignments(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  search_tsv tsvector generated always as (
    setweight(to_tsvector('spanish', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(content, '')), 'B')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_workspace_idx on public.notes(workspace_id);
create index notes_search_tsv_idx on public.notes using gin (search_tsv);
create index notes_course_idx on public.notes(course_id) where course_id is not null;
create index notes_event_idx on public.notes(event_id) where event_id is not null;
create index notes_assignment_idx on public.notes(assignment_id) where assignment_id is not null;
create index notes_project_idx on public.notes(project_id) where project_id is not null;
create trigger trg_notes_updated_at before update on public.notes
  for each row execute function public.set_updated_at();
alter table public.notes enable row level security;
create policy "workspace notes" on public.notes for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

-- Tags: a label per workspace (case-insensitively unique) and a link
-- row per (note, tag). Links carry workspace_id so the client store
-- can scope them like every other table.
create table public.note_tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null,
  color text not null default 'accent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index note_tags_workspace_label_idx on public.note_tags(workspace_id, lower(label));
create trigger trg_note_tags_updated_at before update on public.note_tags
  for each row execute function public.set_updated_at();
alter table public.note_tags enable row level security;
create policy "workspace note_tags" on public.note_tags for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

create table public.note_tag_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note_id uuid not null references public.notes(id) on delete cascade,
  tag_id uuid not null references public.note_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (note_id, tag_id)
);
create index note_tag_links_workspace_idx on public.note_tag_links(workspace_id);
create index note_tag_links_tag_idx on public.note_tag_links(tag_id);
create trigger trg_note_tag_links_updated_at before update on public.note_tag_links
  for each row execute function public.set_updated_at();
alter table public.note_tag_links enable row level security;
create policy "workspace note_tag_links" on public.note_tag_links for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

-- Versions: every autosave snapshots through snapshot_note(), which
-- collapses saves within p_debounce_seconds into one row and keeps
-- the latest p_cap rows per note.
create table public.note_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note_id uuid not null references public.notes(id) on delete cascade,
  version_no integer not null,
  title text not null default '',
  content text not null default '',
  created_at timestamptz not null default now(),
  unique (note_id, version_no)
);
create index note_versions_note_created_idx on public.note_versions(note_id, created_at desc);
alter table public.note_versions enable row level security;
create policy "workspace note_versions" on public.note_versions for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

create or replace function public.snapshot_note(
  p_note_id uuid,
  p_title text,
  p_content text,
  p_debounce_seconds integer default 60,
  p_cap integer default 50
) returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_latest_at timestamptz;
  v_latest_no integer;
  v_next_no integer;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  -- RLS on notes decides whether she may see it at all.
  select workspace_id into v_workspace_id from public.notes where id = p_note_id;
  if v_workspace_id is null then
    raise exception 'note not found' using errcode = 'P0002';
  end if;

  select created_at, version_no into v_latest_at, v_latest_no
  from public.note_versions
  where note_id = p_note_id
  order by version_no desc
  limit 1;

  if v_latest_at is not null and now() - v_latest_at < make_interval(secs => p_debounce_seconds) then
    update public.note_versions
    set title = p_title, content = p_content, created_at = now()
    where note_id = p_note_id and version_no = v_latest_no;
    return v_latest_no;
  end if;

  v_next_no := coalesce(v_latest_no, 0) + 1;
  insert into public.note_versions (workspace_id, note_id, version_no, title, content)
    values (v_workspace_id, p_note_id, v_next_no, p_title, p_content);

  delete from public.note_versions
  where note_id = p_note_id
    and version_no <= v_next_no - greatest(1, coalesce(p_cap, 50));

  return v_next_no;
end;
$$;

-- Full-text search inside one workspace; RLS still gates the rows.
create or replace function public.search_notes(p_workspace_id uuid, p_query text, p_limit integer default 20)
returns table (id uuid, rank real)
language sql
security invoker
set search_path = public, pg_temp
as $$
  select n.id, ts_rank(n.search_tsv, websearch_to_tsquery('spanish', p_query)) as rank
  from public.notes n
  where n.workspace_id = p_workspace_id
    and n.search_tsv @@ websearch_to_tsquery('spanish', p_query)
  order by rank desc, n.updated_at desc
  limit greatest(1, coalesce(p_limit, 20));
$$;
