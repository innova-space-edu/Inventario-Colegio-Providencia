-- Permite distinguir una corrida completa que conserva todas las filas, pero aún requiere revisión.

alter table public.migration_runs
  drop constraint if exists migration_runs_status_check;

alter table public.migration_runs
  add constraint migration_runs_status_check
  check (status in ('running','completed','completed_with_review','failed'));

comment on column public.migration_runs.status is
  'running: en curso; completed: sin errores; completed_with_review: preservación completa pero existen filas rechazadas o pendientes; failed: ejecución incompleta.';
