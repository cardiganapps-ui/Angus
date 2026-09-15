-- Attribute a sale to an event (an expo). Expenses already carry event_id,
-- so with this both halves of an expo's economics are recordable and
-- "did this expo pay for itself" becomes derivable rather than guessed.
alter table public.sales
  add column event_id uuid references public.events(id) on delete set null;

create index sales_event_idx on public.sales(event_id);
