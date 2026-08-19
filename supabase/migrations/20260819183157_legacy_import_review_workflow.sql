-- Revisión administrativa de filas legado que requieren reconciliación manual.

alter table public.legacy_imports
  add column if not exists review_notes text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id);

create index if not exists legacy_imports_reviewed_by_idx
  on public.legacy_imports(reviewed_by);

create index if not exists legacy_imports_status_imported_at_idx
  on public.legacy_imports(migration_status, imported_at desc);

comment on column public.legacy_imports.review_notes is
  'Nota administrativa para reconciliación manual de filas provenientes del sistema Access.';
