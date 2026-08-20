-- Importación automática e idempotente de bajas históricas sin activo vigente equivalente.
-- Conserva la fila Access completa y no inventa una fecha de baja cuando la fuente no la informa.

alter table public.asset_disposals
  alter column disposal_date drop not null;

create or replace function public.import_legacy_disposed_asset_atomic(
  p_stage_id bigint,
  p_family_code text,
  p_asset jsonb,
  p_reason text default 'Registro histórico de baja migrado desde Microsoft Access',
  p_observations text default null,
  p_approved_by text default null,
  p_disposal_date date default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source_table text;
  v_source_id text;
  v_payload jsonb;
  v_stage_asset_id uuid;
  v_family_id uuid;
  v_disposed_status uuid;
  v_asset_id uuid;
  v_disposal_id uuid;
  v_asset_created boolean := false;
  v_disposal_created boolean := false;
  v_after jsonb;
begin
  select li.source_table, li.source_id, li.payload, li.migrated_asset_id
    into v_source_table, v_source_id, v_payload, v_stage_asset_id
  from public.legacy_imports li
  where li.id = p_stage_id
  for update;

  if v_source_table is null or v_source_id is null then
    raise exception 'Fila legado no encontrada o sin identidad fuente';
  end if;

  if regexp_replace(upper(v_source_table), '[^A-Z0-9]+', '', 'g') not like '%BAJA%' then
    raise exception 'La fila legado no corresponde a una tabla de baja';
  end if;

  select f.id into v_family_id
  from public.asset_families f
  where f.code = p_family_code and f.active = true
  limit 1;

  if v_family_id is null then
    raise exception 'Familia tecnológica inválida: %', p_family_code;
  end if;

  select s.id into v_disposed_status
  from public.asset_statuses s
  where s.code = 'disposed' and s.active = true
  limit 1;

  if v_disposed_status is null then
    raise exception 'No existe el estado disposed';
  end if;

  select a.id into v_asset_id
  from public.assets a
  where a.legacy_source = v_source_table
    and a.legacy_id = v_source_id
  limit 1
  for update;

  if v_asset_id is null and v_stage_asset_id is not null then
    select a.id into v_asset_id
    from public.assets a
    where a.id = v_stage_asset_id
    limit 1
    for update;
  end if;

  if v_asset_id is null then
    insert into public.assets(
      inventory_code, family_id, status_id, location_id, name, asset_type,
      brand, model, serial_number, quantity, area, observations, is_disposed,
      legacy_source, legacy_id, legacy_data, created_by, updated_by
    ) values (
      nullif(btrim(p_asset->>'inventory_code'), ''), v_family_id, v_disposed_status, null,
      nullif(btrim(p_asset->>'name'), ''), nullif(btrim(p_asset->>'asset_type'), ''),
      nullif(btrim(p_asset->>'brand'), ''), nullif(btrim(p_asset->>'model'), ''),
      nullif(btrim(p_asset->>'serial_number'), ''), 1,
      nullif(btrim(p_asset->>'area'), ''), nullif(btrim(p_asset->>'observations'), ''), true,
      v_source_table, v_source_id, v_payload, null, null
    ) returning id into v_asset_id;

    v_asset_created := true;
  else
    update public.assets
       set status_id = v_disposed_status,
           is_disposed = true,
           legacy_data = v_payload
     where id = v_asset_id;
  end if;

  insert into public.asset_disposals(
    asset_id, disposal_date, reason, observations, approved_by,
    legacy_data, legacy_import_id, created_by
  ) values (
    v_asset_id, p_disposal_date, nullif(btrim(p_reason), ''),
    nullif(btrim(p_observations), ''), nullif(btrim(p_approved_by), ''),
    v_payload, p_stage_id, null
  )
  on conflict do nothing
  returning id into v_disposal_id;

  if v_disposal_id is not null then
    v_disposal_created := true;
  else
    select d.id into v_disposal_id
    from public.asset_disposals d
    where d.legacy_import_id = p_stage_id
    limit 1;
  end if;

  select to_jsonb(a) into v_after
  from public.assets a
  where a.id = v_asset_id;

  if v_asset_created or v_disposal_created then
    insert into public.asset_history(
      asset_id, event_type, description, before_data, after_data, actor_id
    ) values (
      v_asset_id,
      'legacy_disposal_import',
      format('Activo histórico dado de baja importado desde %s (%s).', v_source_table, v_source_id),
      null,
      v_after || jsonb_build_object('legacy_import_id', p_stage_id, 'disposal_id', v_disposal_id),
      null
    );
  end if;

  update public.legacy_imports
     set migration_status = 'migrated',
         migrated_asset_id = v_asset_id,
         error_message = null,
         reviewed_at = coalesce(reviewed_at, now()),
         review_notes = coalesce(
           review_notes,
           format('Baja histórica sin coincidencia exacta con activos vigentes; se creó un activo histórico dado de baja en la familia %s.', p_family_code)
         )
   where id = p_stage_id;

  return jsonb_build_object(
    'asset_id', v_asset_id,
    'disposal_id', v_disposal_id,
    'asset_created', v_asset_created,
    'disposal_created', v_disposal_created
  );
end;
$$;

revoke execute on function public.import_legacy_disposed_asset_atomic(bigint, text, jsonb, text, text, text, date)
  from public, anon, authenticated;
grant execute on function public.import_legacy_disposed_asset_atomic(bigint, text, jsonb, text, text, text, date)
  to service_role;

comment on function public.import_legacy_disposed_asset_atomic(bigint, text, jsonb, text, text, text, date) is
  'Crea o repara un activo histórico dado de baja desde legacy_imports y registra asset_disposals + historial en una sola transacción. Solo service_role.';
