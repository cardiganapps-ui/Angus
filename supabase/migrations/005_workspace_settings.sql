-- Workspace settings: the per-studio preferences that make Angus feel
-- like Andrea's (her name, what she does, how she charges, budgets,
-- appearance) plus the onboarding marker. Stored as one jsonb blob whose
-- shape lives in src/types.ts (WorkspaceSettings) and is normalized by
-- src/utils/settings.ts — unknown keys are ignored, missing keys default,
-- so a client and the row can never disagree on the schema.
--
-- workspaces had no updated_at; add it with the shared trigger so a
-- settings write is stamped like every other table.

alter table public.workspaces
  add column settings jsonb not null default '{}'::jsonb,
  add column onboarded_at timestamptz,
  add column updated_at timestamptz not null default now();

create trigger trg_workspaces_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();

-- The existing "admin updates workspace" policy (is_workspace_admin)
-- already lets the owner write these columns; members stay read-only.
