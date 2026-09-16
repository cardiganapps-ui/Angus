-- sales_session_contact_uidx (migration 010) guards the wrong set of rows.
--
-- It exists to make per-session class tuition idempotent: one sale per
-- (session, student), where period_key is the session event's uuid. The
-- predicate it uses to pick those rows out is `recurring_rule_id is
-- null` — and that is not a property of the row, it is a property of the
-- row's HISTORY. `sales.recurring_rule_id` is `on delete set null`
-- (migration 006, deliberately: deleting a rule must never delete money
-- that already happened), so every sale a rule ever generated walks into
-- this index the moment its rule is deleted, carrying a period_key like
-- '2026-09' instead of a session id.
--
-- Two rules can bill the same contact for the same period. A student
-- enrolled in two class groups gets one monthly income rule per group
-- (ClassGroupDetailSheet), and each materializes a sale with
-- period_key = '2026-09' and the same contact_id. While both rules exist
-- the rows sit outside this index and nothing notices. Delete the first
-- rule and its sale takes ('2026-09', <student>). Delete the second and
-- the SET NULL cascade tries to write the identical key:
--
--     ERROR: duplicate key value violates unique constraint
--            "sales_session_contact_uidx"
--
-- ...raised by the DELETE of the rule, not by any insert. Worse, 23505 is
-- the code the client reads as "already materialized, reload"
-- (hooks/useCloudStore.ts), so the delete that failed is the delete she
-- is told succeeded — Prime Directive #1, from an angle no code change
-- could reach.
--
-- The fix is to make the index say what it means. A per-session tuition
-- sale is one whose period_key IS a session id, so match that shape
-- instead of inferring it from an absent foreign key. Nothing else
-- changes: the two unique indexes on sales stay disjoint for the
-- original reason too (sales_rule_period_uidx requires
-- `recurring_rule_id is not null`), and the rows AttendanceSheet inserts
-- are covered exactly as before, so the 23505-means-already-there path
-- it relies on is untouched. Orphaned rule rows end up guarded by
-- nothing, which is right: they are history, not something a generator
-- will try to create again.
--
-- What is NOT changed here, because it is not broken: the key has no
-- workspace_id and does not need one. contact_id is the primary key of a
-- row that belongs to exactly one workspace, so two workspaces cannot
-- produce the same (period_key, contact_id) pair however hard they try.
-- Adding workspace_id would widen the index and leave tenancy exactly as
-- strong as it already is. The collision above is inside one workspace,
-- between two of her own rules.
--
-- The new predicate is a strict subset of the old one, so any data the
-- old index accepted the new one accepts; there is nothing to clean up
-- first. Case-insensitive on the hex because period_key is text, not
-- uuid, and only the client's spelling has ever kept it lower-case.

drop index if exists public.sales_session_contact_uidx;

create unique index if not exists sales_session_contact_uidx
  on public.sales (period_key, contact_id)
  where recurring_rule_id is null
    and period_key ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
