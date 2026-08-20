-- Reconciliación manual de las tablas históricas BAJA de Microsoft Access.

alter table public.asset_disposals
  add column if not exists legacy_import_id bigint references public.legacy_imports(id);

create unique index if not exists asset_disposals_legacy_import_unique
  on public.asset_disposals(legacy_import_id)
  where legacy_import_id is not null;

create or replace function public.reconcile_legacy_disposal_atomic(
  p_stage_id bigint,
  p_asset_id uuid,
  p_reason text,
  p_observations text default null,
  p_approved_by text default null,
  p_disposal_date date default current_date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_source_table text;
  v_source_id text;
  v_payload jsonb;
  v_stage_status text;
  v_asset_before jsonb;
  v_asset_after jsonb;
  v_is_disposed boolean;
  v_disposed_status uuid;
  v_disposal_id uuid;
begin
  if v_actor is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not public.has_permission('imports.manage') or not public.has_permission('inventory.dispose') then
    raise exception 'Se requieren permisos imports.manage e inventory.dispose';
  end if;

  select li.source_table, li.source_id, li.payload, li.migration_status
    into v_source_table, v_source_id, v_payload, v_stage_status
  from public.legacy_imports li
  where li.id = p_stage_id
  for update;

  if v_source_table is null then
    raise exception 'Fila legado no encontrada';
  end if;

  if upper(v_source_table) not like '%BAJA%' then
    raise exception 'La fila legado no corresponde a una tabla de baja';
  end if;

  if v_stage_status = 'migrated' then
    select d.id into v_disposal_id
    from public.asset_disposals d
    where d.legacy_import_id = p_stage_id
    limit 1;

    if v_disposal_id is not null then
      return v_disposal_id;
    end if;

    raise exception 'La fila legado ya está marcada como migrada';
  end if;

  select to_jsonb(a), a.is_disposed
    into v_asset_before, v_is_disposed
  from public.assets a
  where a.id = p_asset_id
  for update;

  if v_asset_before is null then
    raise exception 'Activo no encontrado';
  end if;

  select s.id into v_disposed_status
  from public.asset_statuses s
  where s.code = 'disposed' and s.active = true
  limit 1;

  if v_disposed_status is null then
    raise exception 'No existe el estado disposed';
  end if;

  if not v_is_disposed then
    update public.assets
       set is_disposed = true,
           status_id = v_disposed_status,
           updated_by = v_actor
     where id = p_asset_id;
  end if;

  insert into public.asset_disposals(
    asset_id,
    disposal_date,
    reason,
    observations,
    approved_by,
    legacy_data,
    legacy_import_id,
    created_by
  ) values (
    p_asset_id,
    coalesce(p_disposal_date, current_date),
    nullif(btrim(p_reason), ''),
    nullif(btrim(p_observations), ''),
    nullif(btrim(p_approved_by), ''),
    v_payload,
    p_stage_id,
    v_actor
  )
  returning id into v_disposal_id;

  select to_jsonb(a) into v_asset_after
  from public.assets a
  where a.id = p_asset_id;

  insert into public.asset_history(
    asset_id,
    event_type,
    description,
    before_data,
    after_data,
    actor_id
  ) values (
    p_asset_id,
    'disposed',
    format('Baja histórica reconciliada desde %s (%s): %s',
      v_source_table,
      coalesce(v_source_id, p_stage_id::text),
      coalesce(nullif(btrim(p_reason), ''), 'sin motivo informado')
    ),
    v_asset_before,
    v_asset_after,
    v_actor
  );

  update public.legacy_imports
     set migration_status = 'migrated',
         migrated_asset_id = p_asset_id,
         error_message = null,
         reviewed_at = now(),
         reviewed_by = v_actor,
         review_notes = coalesce(review_notes, 'Baja histórica reconciliada con un activo del inventario.')
   where id = p_stage_id;

  return v_disposal_id;
end;
$$;

revoke execute on function public.reconcile_legacy_disposal_atomic(bigint, uuid, text, text, text, date)
  from public, anon;
grant execute on function public.reconcile_legacy_disposal_atomic(bigint, uuid, text, text, text, date)
  to authenticated;

comment on column public.asset_disposals.legacy_import_id is
  'Fila de legacy_imports que originó esta baja histórica, cuando aplica.';
comment on function public.reconcile_legacy_disposal_atomic(bigint, uuid, text, text, text, date) is
  'Vincula una fila BAJA de Access con un activo y registra la baja, historial y reconciliación en una sola transacción.';
