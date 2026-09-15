-- Period keys name the period, not the day (see utils/recurrence.ts):
-- "YYYY-MM" for monthly and slower, the week's Monday for weekly and
-- biweekly. Re-key anything generated under the old date keys so a
-- rule edit can't duplicate a period. Idempotent.
update public.sales s
   set period_key = left(s.date::text, 7)
  from public.recurring_rules r
 where s.recurring_rule_id = r.id
   and r.cadence in ('monthly', 'quarterly', 'yearly')
   and s.period_key is distinct from left(s.date::text, 7);

update public.expenses e
   set period_key = left(e.date::text, 7)
  from public.recurring_rules r
 where e.recurring_rule_id = r.id
   and r.cadence in ('monthly', 'quarterly', 'yearly')
   and e.period_key is distinct from left(e.date::text, 7);

update public.sales s
   set period_key = (s.date - (extract(isodow from s.date)::int - 1))::text
  from public.recurring_rules r
 where s.recurring_rule_id = r.id
   and r.cadence in ('weekly', 'biweekly')
   and s.period_key is distinct from (s.date - (extract(isodow from s.date)::int - 1))::text;

update public.expenses e
   set period_key = (e.date - (extract(isodow from e.date)::int - 1))::text
  from public.recurring_rules r
 where e.recurring_rule_id = r.id
   and r.cadence in ('weekly', 'biweekly')
   and e.period_key is distinct from (e.date - (extract(isodow from e.date)::int - 1))::text;

-- Per-session tuition: one sale per (session, student). These rows carry
-- period_key = the session's event id and no rule, so the rule index
-- never guarded them; this one does (Prime Directive #3).
create unique index if not exists sales_session_contact_uidx
  on public.sales (period_key, contact_id)
  where recurring_rule_id is null and period_key is not null;
