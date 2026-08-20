-- Vincula cada fila legado con la primera y última ejecución de migración
-- en la que apareció, para poder reconciliar conteos por corrida.

alter table public.legacy_imports
  add column if not exists first_seen_run_id uuid references public.migration_runs(id),
  add column if not exists last_seen_run_id uuid references public.migration_runs(id);

create index if not exists legacy_imports_first_seen_run_idx
  on public.legacy_imports(first_seen_run_id);

create index if not exists legacy_imports_last_seen_run_idx
  on public.legacy_imports(last_seen_run_id);

comment on column public.legacy_imports.first_seen_run_id is
  'Primera ejecución de migración en la que apareció esta fila fuente.';
comment on column public.legacy_imports.last_seen_run_id is
  'Última ejecución de migración en la que apareció esta fila fuente.';
