-- Money model, round two: what kind of income a sale is, how she agreed
-- to be paid, a wider set of expense categories, and recurring rules
-- that materialize sales / expenses each period.
--
-- Check constraints mirror INCOME_CATEGORY / PAYMENT_TERMS /
-- EXPENSE_CATEGORY / RECURRENCE_* in src/data/constants.ts — change both
-- in the same commit.

-- ── sales ──────────────────────────────────────────────────────────────
alter table public.sales
  add column category text not null default 'piece'
    check (category in ('piece','commission','class','workshop','service','license','grant','other')),
  -- The intent she picks when the sale is agreed. The installments
  -- table remains the plan itself; this column only says which shape
  -- she chose so the sheet can show the right controls.
  add column payment_terms text not null default 'single'
    check (payment_terms in ('single','deposit_balance','installments'));

-- A sale that already has a plan was, in practice, sold in installments.
update public.sales s set payment_terms = 'installments'
  where exists (select 1 from public.installments i where i.sale_id = s.id);

-- ── expenses ───────────────────────────────────────────────────────────
alter table public.expenses drop constraint expenses_category_check;
alter table public.expenses add constraint expenses_category_check check (category in (
  'materials','studio','equipment','transport','courses','expo','fees',
  'framing','shipping','marketing','software','rent','services','taxes','food','other'
));
alter table public.expenses
  add column method text
    check (method is null or method in ('cash','transfer','card','other'));

-- ── recurring rules ────────────────────────────────────────────────────
-- "Every month, rent 6,500" / "Every month, Sofía's tuition 1,800".
-- `category` is validated client-side against the kind's list (income
-- vs expense categories differ); Postgres only guards kind and cadence.
create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('income','expense')),
  title text not null,
  amount numeric(12,2) not null check (amount > 0),
  category text not null,
  cadence text not null check (cadence in ('weekly','biweekly','monthly','quarterly','yearly')),
  interval int not null default 1 check (interval between 1 and 12),
  start_date date not null,
  end_date date,
  contact_id uuid references public.contacts(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recurring_rules_workspace_idx on public.recurring_rules(workspace_id);
create trigger trg_recurring_rules_updated_at before update on public.recurring_rules
  for each row execute function public.set_updated_at();
alter table public.recurring_rules enable row level security;
create policy "workspace recurring_rules" on public.recurring_rules for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

-- Provenance + idempotency on materialized rows. `set null` on the rule:
-- deleting a rule never deletes money that already happened.
alter table public.sales
  add column recurring_rule_id uuid references public.recurring_rules(id) on delete set null,
  add column period_key text;
alter table public.expenses
  add column recurring_rule_id uuid references public.recurring_rules(id) on delete set null,
  add column period_key text;

-- One row per rule per period, whichever device gets there first. The
-- client treats 23505 on these as "already materialized" (useCloudStore).
create unique index sales_rule_period_uidx
  on public.sales(recurring_rule_id, period_key) where recurring_rule_id is not null;
create unique index expenses_rule_period_uidx
  on public.expenses(recurring_rule_id, period_key) where recurring_rule_id is not null;
