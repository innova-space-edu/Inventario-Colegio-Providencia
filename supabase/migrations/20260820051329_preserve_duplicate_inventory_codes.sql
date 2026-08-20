-- El inventario histórico puede contener códigos repetidos. Se preservan como dato real
-- y se detectan en Calidad de datos, en vez de borrar/nullificar uno de ellos.

drop index if exists public.assets_inventory_code_unique_not_null;

create index if not exists assets_inventory_code_normalized_idx
  on public.assets (upper(inventory_code))
  where inventory_code is not null;

create or replace function public.import_legacy_asset_atomic(
  p_stage_id bigint,
  p_family_code text,
  p_location_id uuid,
  p_asset jsonb,
  p_details jsonb default '{}'::jsonb
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
  v_asset_id uuid;
  v_family_id uuid;
  v_status_id uuid;
  v_inventory_code text;
  v_quantity integer;
  v_created boolean := false;
  v_after jsonb;
begin
  select li.source_table, li.source_id, li.payload
    into v_source_table, v_source_id, v_payload
  from public.legacy_imports li
  where li.id = p_stage_id
  for update;

  if v_source_table is null or v_source_id is null then
    raise exception 'Fila legado no encontrada o sin identidad fuente';
  end if;

  select f.id into v_family_id
  from public.asset_families f
  where f.code = p_family_code and f.active = true
  limit 1;

  if v_family_id is null then
    raise exception 'Familia tecnológica inválida: %', p_family_code;
  end if;

  select s.id into v_status_id
  from public.asset_statuses s
  where s.code = 'operational' and s.active = true
  limit 1;

  if v_status_id is null then
    select s.id into v_status_id
    from public.asset_statuses s
    where s.active = true and not s.is_disposed
    order by case when s.code = 'active' then 0 else 1 end, s.name
    limit 1;
  end if;

  select a.id into v_asset_id
  from public.assets a
  where a.legacy_source = v_source_table and a.legacy_id = v_source_id
  limit 1
  for update;

  if v_asset_id is null then
    v_inventory_code := nullif(btrim(p_asset->>'inventory_code'), '');

    begin
      v_quantity := greatest(coalesce(nullif(p_asset->>'quantity', '')::integer, 1), 1);
    exception when invalid_text_representation or numeric_value_out_of_range then
      v_quantity := 1;
    end;

    insert into public.assets(
      inventory_code, family_id, status_id, location_id, name, asset_type,
      brand, model, serial_number, quantity, area, observations, is_disposed,
      legacy_source, legacy_id, legacy_data, created_by, updated_by
    ) values (
      v_inventory_code, v_family_id, v_status_id, p_location_id,
      nullif(btrim(p_asset->>'name'), ''), nullif(btrim(p_asset->>'asset_type'), ''),
      nullif(btrim(p_asset->>'brand'), ''), nullif(btrim(p_asset->>'model'), ''),
      nullif(btrim(p_asset->>'serial_number'), ''), v_quantity,
      nullif(btrim(p_asset->>'area'), ''), nullif(btrim(p_asset->>'observations'), ''),
      false, v_source_table, v_source_id, v_payload, null, null
    )
    returning id into v_asset_id;

    v_created := true;
  else
    update public.assets set legacy_data = v_payload where id = v_asset_id;
  end if;

  if p_family_code = 'computer' then
    insert into public.computer_details(
      asset_id, memory, storage, screen, keyboard, battery, charger, legacy_data
    ) values (
      v_asset_id,
      nullif(btrim(p_details->>'memory'), ''), nullif(btrim(p_details->>'storage'), ''),
      nullif(btrim(p_details->>'screen'), ''), nullif(btrim(p_details->>'keyboard'), ''),
      nullif(btrim(p_details->>'battery'), ''), nullif(btrim(p_details->>'charger'), ''), v_payload
    )
    on conflict (asset_id) do update set
      memory = excluded.memory, storage = excluded.storage, screen = excluded.screen,
      keyboard = excluded.keyboard, battery = excluded.battery, charger = excluded.charger,
      legacy_data = excluded.legacy_data;
  elsif p_family_code = 'projector' then
    insert into public.projector_details(asset_id, lumens, hdmi, vga, legacy_data)
    values (
      v_asset_id, nullif(btrim(p_details->>'lumens'), ''),
      nullif(btrim(p_details->>'hdmi'), ''), nullif(btrim(p_details->>'vga'), ''), v_payload
    )
    on conflict (asset_id) do update set
      lumens = excluded.lumens, hdmi = excluded.hdmi, vga = excluded.vga,
      legacy_data = excluded.legacy_data;
  elsif p_family_code = 'television' then
    insert into public.television_details(asset_id, size, legacy_data)
    values (v_asset_id, nullif(btrim(p_details->>'size'), ''), v_payload)
    on conflict (asset_id) do update set
      size = excluded.size, legacy_data = excluded.legacy_data;
  end if;

  if v_created then
    select to_jsonb(a) into v_after from public.assets a where a.id = v_asset_id;
    insert into public.asset_history(asset_id, event_type, description, after_data, actor_id)
    values (
      v_asset_id, 'legacy_import',
      format('Importado desde %s (%s).', v_source_table, v_source_id),
      v_after, null
    );
  end if;

  update public.legacy_imports
     set migration_status = 'migrated', migrated_asset_id = v_asset_id, error_message = null
   where id = p_stage_id;

  return jsonb_build_object('asset_id', v_asset_id, 'created', v_created);
end;
$$;

revoke execute on function public.import_legacy_asset_atomic(bigint, text, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_legacy_asset_atomic(bigint, text, uuid, jsonb, jsonb)
  to service_role;

comment on index public.assets_inventory_code_normalized_idx is
  'Índice de búsqueda normalizado. No impone unicidad porque el inventario histórico puede contener códigos repetidos que deben preservarse.';
