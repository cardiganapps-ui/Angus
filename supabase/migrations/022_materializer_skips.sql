-- A row she deleted must stay deleted.
--
-- The materializers (utils/materialize.ts) compute what is MISSING by
-- diffing the loaded rows against every period each active rule covers,
-- and insert the difference. That is what makes them idempotent, and it
-- is also why deleting a generated row does not work: the row becomes
-- missing, so the next materializer round puts it straight back. She
-- deletes September's rent, it returns, she deletes it again, and the
-- per-session breaker is the only thing that eventually stops the loop.
-- From her side the app simply refuses to let her delete something.
--
-- The obvious fix — a `voided` column on sales and expenses — was
-- rejected. Every money derivation in utils/ would have to learn to
-- filter it, and the one that got missed would report a wrong total
-- silently. Under this project's Prime Directive a wrong number is worse
-- than the bug being fixed.
--
-- So the skip lives outside the money tables entirely. Nothing derives
-- from it, nothing sums it; `materialize.ts` is its only reader. The row
-- is genuinely deleted, exactly as she asked, and simply is not
-- regenerated.
--
-- Cascades with its rule on purpose: if the rule is gone there is no
-- generator left to skip, and keeping the tombstone would only leak.

create table public.materializer_skips (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recurring_rule_id uuid not null references public.recurring_rules(id) on delete cascade,
  -- Same union of shapes as sales.period_key: 'YYYY-MM' for monthly /
  -- quarterly / yearly rules, the ISO Monday for weekly / biweekly.
  -- Never a session uuid — per-session tuition is not rule-generated.
  period_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One skip per (rule, period). Re-deleting a row that came back is the
-- expected path, so the client writes this idempotently and tolerates 23505.
create unique index materializer_skips_rule_period_uidx
  on public.materializer_skips(recurring_rule_id, period_key);
create index materializer_skips_workspace_idx on public.materializer_skips(workspace_id);

create trigger trg_materializer_skips_updated_at before update on public.materializer_skips
  for each row execute function public.set_updated_at();

alter table public.materializer_skips enable row level security;
create policy "workspace materializer_skips" on public.materializer_skips for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
