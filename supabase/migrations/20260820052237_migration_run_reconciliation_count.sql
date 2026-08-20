-- Conteo exacto de filas preservadas por ejecución de migración, sin límites de paginación del Data API.

create or replace function public.count_legacy_rows_for_run(p_run_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::bigint
  from public.legacy_imports li
  where li.last_seen_run_id = p_run_id;
$$;

revoke execute on function public.count_legacy_rows_for_run(uuid)
  from public, anon, authenticated;
grant execute on function public.count_legacy_rows_for_run(uuid)
  to service_role;

comment on function public.count_legacy_rows_for_run(uuid) is
  'Cuenta exactamente las filas legado vistas en una ejecución, sin límite de paginación del Data API. Solo service_role.';
