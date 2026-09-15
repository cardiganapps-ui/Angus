-- Obra as an inventory: where a piece is, whether it can be sold, how big
-- it is. Plus a budget on expo events so "did it pay for itself" has a
-- plan to compare against (utils/expo.ts).

alter table public.projects
  add column availability text not null default 'available'
    check (availability in ('available','reserved','sold','not_for_sale','gifted')),
  add column dimensions text not null default '',
  add column year int,
  add column edition text not null default '',
  add column location text not null default '',
  add column cost numeric(12,2) check (cost is null or cost >= 0);

-- A piece with a confirmed or delivered sale has, in practice, been sold.
update public.projects p set availability = 'sold'
  where exists (
    select 1 from public.sales s
    where s.project_id = p.id and s.status in ('confirmed','delivered')
  );

alter table public.events
  add column budget numeric(12,2) check (budget is null or budget >= 0);
