-- Money layer: sales, the payments received against them, the scheduled
-- installments that make up a payment plan, and expenses. Nothing is
-- denormalized — every balance is derived by src/utils/accounting.ts.
-- Check constraints mirror SALE_STATUS / PAYMENT_METHOD / EXPENSE_CATEGORY
-- in src/data/constants.ts; change both together.

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  amount numeric(12,2) not null check (amount >= 0),
  date date not null,
  status text not null default 'confirmed'
    check (status in ('quoted','confirmed','delivered','cancelled')),
  project_id uuid references public.projects(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sales_workspace_idx on public.sales(workspace_id);
create index sales_contact_idx on public.sales(contact_id);
create trigger trg_sales_updated_at before update on public.sales
  for each row execute function public.set_updated_at();

-- Payments belong to a sale: deleting the sale removes the money trail
-- with it, which is what "this sale never happened" means.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  date date not null,
  method text not null default 'transfer'
    check (method in ('cash','transfer','card','other')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_workspace_idx on public.payments(workspace_id);
create index payments_sale_idx on public.payments(sale_id);
create trigger trg_payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

create table public.installments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  due_date date not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index installments_workspace_idx on public.installments(workspace_id);
create index installments_sale_idx on public.installments(sale_id, due_date);
create trigger trg_installments_updated_at before update on public.installments
  for each row execute function public.set_updated_at();

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  amount numeric(12,2) not null check (amount > 0),
  date date not null,
  category text not null default 'other'
    check (category in ('materials','studio','equipment','transport','courses','expo','fees','other')),
  project_id uuid references public.projects(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expenses_workspace_date_idx on public.expenses(workspace_id, date);
create trigger trg_expenses_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();

alter table public.sales enable row level security;
alter table public.payments enable row level security;
alter table public.installments enable row level security;
alter table public.expenses enable row level security;

create policy "workspace sales" on public.sales for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "workspace payments" on public.payments for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "workspace installments" on public.installments for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "workspace expenses" on public.expenses for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
