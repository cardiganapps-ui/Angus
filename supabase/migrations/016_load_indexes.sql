-- Every store loads one workspace ordered by created_at desc. That sort
-- had no index anywhere: only events and expenses were composite, and on
-- `date`, not `created_at`. Reads are also paged now, and paging needs a
-- TOTAL order — two rows sharing a created_at can otherwise swap between
-- pages, so one is fetched twice and another never — hence the id tiebreak.
--
-- Only the tables that actually grow get one. On a table bounded by the
-- number of people she knows, sorting a few dozen rows is free and the
-- index would only add write cost; those keep their plain
-- <table>_workspace_idx from earlier migrations.

create index if not exists events_workspace_created_idx
  on public.events(workspace_id, created_at desc, id);
create index if not exists sales_workspace_created_idx
  on public.sales(workspace_id, created_at desc, id);
create index if not exists payments_workspace_created_idx
  on public.payments(workspace_id, created_at desc, id);
create index if not exists installments_workspace_created_idx
  on public.installments(workspace_id, created_at desc, id);
create index if not exists expenses_workspace_created_idx
  on public.expenses(workspace_id, created_at desc, id);
create index if not exists attendance_workspace_created_idx
  on public.attendance(workspace_id, created_at desc, id);
create index if not exists assignments_workspace_created_idx
  on public.assignments(workspace_id, created_at desc, id);
create index if not exists notes_workspace_created_idx
  on public.notes(workspace_id, created_at desc, id);
create index if not exists documents_workspace_created_idx
  on public.documents(workspace_id, created_at desc, id);
create index if not exists note_tag_links_workspace_created_idx
  on public.note_tag_links(workspace_id, created_at desc, id);
create index if not exists note_attachments_workspace_created_idx
  on public.note_attachments(workspace_id, created_at desc, id);

-- note_versions is the one workspace-scoped table with no workspace index
-- at all. It is read by note_id (note_versions_note_created_idx covers
-- that), but the workspace FK cascade has nothing to scan.
create index if not exists note_versions_workspace_idx
  on public.note_versions(workspace_id);
