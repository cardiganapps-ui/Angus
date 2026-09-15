-- Two relationships from the student side of her life: the person who
-- teaches her, and the school or institution that hosts the course.
alter table public.contacts drop constraint if exists contacts_relationship_check;
alter table public.contacts add constraint contacts_relationship_check
  check (relationship in ('lead','client','gallery','supplier','collaborator','teacher','school','other'));
