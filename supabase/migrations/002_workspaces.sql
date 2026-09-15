-- Workspaces: one artist's data, shared with named members. Every data row
-- carries workspace_id; RLS is membership-based via is_workspace_member().
-- is_admin() (the account in ADMIN_EMAIL below) is implicitly a member of
-- every workspace with full read/write. Keep ADMIN_EMAIL in sync with
-- src/config/admin.ts.

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mi estudio',
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members(user_id);

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'gaxioladiego@gmail.com'
$$;

-- security definer so data-table policies can consult workspace_members
-- without tripping that table's own RLS (no recursion).
create or replace function public.is_workspace_member(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  )
$$;

create or replace function public.is_workspace_admin(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.role in ('owner','admin')
  )
$$;

-- Every new account gets its own workspace.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  insert into public.workspaces (name, owner_id) values ('Mi estudio', new.id) returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, new.id, 'owner');
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Backfill accounts that already exist.
insert into public.workspaces (name, owner_id)
  select 'Mi estudio', u.id from auth.users u
  where not exists (select 1 from public.workspaces w where w.owner_id = u.id);
insert into public.workspace_members (workspace_id, user_id, role)
  select w.id, w.owner_id, 'owner' from public.workspaces w
  on conflict do nothing;

-- Data tables: add workspace_id, backfill from the creator's own workspace.
alter table public.contacts add column workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.projects add column workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.events   add column workspace_id uuid references public.workspaces(id) on delete cascade;

update public.contacts c set workspace_id = w.id from public.workspaces w where w.owner_id = c.user_id;
update public.projects p set workspace_id = w.id from public.workspaces w where w.owner_id = p.user_id;
update public.events   e set workspace_id = w.id from public.workspaces w where w.owner_id = e.user_id;

alter table public.contacts alter column workspace_id set not null;
alter table public.projects alter column workspace_id set not null;
alter table public.events   alter column workspace_id set not null;

create index contacts_workspace_idx on public.contacts(workspace_id);
create index projects_workspace_idx on public.projects(workspace_id);
create index events_workspace_date_idx on public.events(workspace_id, date);

-- RLS: membership replaces ownership.
drop policy "own contacts" on public.contacts;
drop policy "own projects" on public.projects;
drop policy "own events"   on public.events;

create policy "workspace contacts" on public.contacts for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "workspace projects" on public.projects for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "workspace events" on public.events for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

create policy "member can read workspace" on public.workspaces for select to authenticated
  using (public.is_workspace_member(id));
create policy "owner creates workspace" on public.workspaces for insert to authenticated
  with check (owner_id = auth.uid());
create policy "admin updates workspace" on public.workspaces for update to authenticated
  using (public.is_workspace_admin(id)) with check (public.is_workspace_admin(id));

create policy "member can read members" on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy "admin manages members" on public.workspace_members for insert to authenticated
  with check (public.is_workspace_admin(workspace_id));
create policy "admin updates members" on public.workspace_members for update to authenticated
  using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy "admin removes members" on public.workspace_members for delete to authenticated
  using (public.is_workspace_admin(workspace_id));
