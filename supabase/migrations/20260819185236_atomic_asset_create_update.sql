-- Alta y edición atómica de activos, detalles de familia e historial.

create or replace function public.create_asset_atomic(
  p_asset jsonb,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_asset_id uuid;
  v_family_code text;
  v_after jsonb;
  v_family_id uuid;
  v_status_id uuid;
  v_location_id uuid;
  v_quantity integer;
begin
  if v_actor is null then raise exception 'Usuario no autenticado'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_actor and p.role = 'admin' and p.active = true) then raise exception 'Acceso administrativo requerido'; end if;

  v_family_id := nullif(p_asset->>'family_id', '')::uuid;
  v_status_id := nullif(p_asset->>'status_id', '')::uuid;
  v_location_id := nullif(p_asset->>'location_id', '')::uuid;
  v_quantity := greatest(coalesce(nullif(p_asset->>'quantity', '')::integer, 1), 1);
  if v_family_id is null then raise exception 'La familia tecnológica es obligatoria'; end if;

  select f.code into v_family_code from public.asset_families f where f.id = v_family_id and f.active = true;
  if v_family_code is null then raise exception 'Familia tecnológica inválida o inactiva'; end if;

  insert into public.assets(inventory_code, family_id, status_id, location_id, name, asset_type, brand, model, serial_number, quantity, area, observations, created_by, updated_by)
  values (
    nullif(btrim(p_asset->>'inventory_code'), ''), v_family_id, v_status_id, v_location_id,
    nullif(btrim(p_asset->>'name'), ''), nullif(btrim(p_asset->>'asset_type'), ''),
    nullif(btrim(p_asset->>'brand'), ''), nullif(btrim(p_asset->>'model'), ''),
    nullif(btrim(p_asset->>'serial_number'), ''), v_quantity,
    nullif(btrim(p_asset->>'area'), ''), nullif(btrim(p_asset->>'observations'), ''),
    v_actor, v_actor
  ) returning id into v_asset_id;

  if v_family_code = 'computer' then
    insert into public.computer_details(asset_id, memory, storage, screen, keyboard, battery, charger)
    values (v_asset_id, nullif(btrim(p_details->>'memory'), ''), nullif(btrim(p_details->>'storage'), ''), nullif(btrim(p_details->>'screen'), ''), nullif(btrim(p_details->>'keyboard'), ''), nullif(btrim(p_details->>'battery'), ''), nullif(btrim(p_details->>'charger'), ''));
  elsif v_family_code = 'projector' then
    insert into public.projector_details(asset_id, lumens, hdmi, vga)
    values (v_asset_id, nullif(btrim(p_details->>'lumens'), ''), nullif(btrim(p_details->>'hdmi'), ''), nullif(btrim(p_details->>'vga'), ''));
  elsif v_family_code = 'television' then
    insert into public.television_details(asset_id, size)
    values (v_asset_id, nullif(btrim(p_details->>'size'), ''));
  end if;

  select to_jsonb(a) into v_after from public.assets a where a.id = v_asset_id;
  insert into public.asset_history(asset_id, event_type, description, after_data, actor_id)
  values (v_asset_id, 'created', 'Activo creado desde la aplicación web.', v_after, v_actor);
  return v_asset_id;
end;
$$;

create or replace function public.update_asset_atomic(
  p_asset_id uuid,
  p_asset jsonb,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_before jsonb;
  v_after jsonb;
  v_family_id uuid;
  v_family_code text;
  v_status_id uuid;
  v_location_id uuid;
  v_quantity integer;
begin
  if v_actor is null then raise exception 'Usuario no autenticado'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_actor and p.role = 'admin' and p.active = true) then raise exception 'Acceso administrativo requerido'; end if;

  select to_jsonb(a), a.family_id into v_before, v_family_id from public.assets a where a.id = p_asset_id for update;
  if v_before is null then raise exception 'Activo no encontrado'; end if;
  select f.code into v_family_code from public.asset_families f where f.id = v_family_id;
  if v_family_code is null then raise exception 'Familia tecnológica inválida'; end if;

  v_status_id := nullif(p_asset->>'status_id', '')::uuid;
  v_location_id := nullif(p_asset->>'location_id', '')::uuid;
  v_quantity := greatest(coalesce(nullif(p_asset->>'quantity', '')::integer, 1), 1);

  update public.assets set
    inventory_code = nullif(btrim(p_asset->>'inventory_code'), ''), status_id = v_status_id, location_id = v_location_id,
    name = nullif(btrim(p_asset->>'name'), ''), asset_type = nullif(btrim(p_asset->>'asset_type'), ''), brand = nullif(btrim(p_asset->>'brand'), ''),
    model = nullif(btrim(p_asset->>'model'), ''), serial_number = nullif(btrim(p_asset->>'serial_number'), ''), quantity = v_quantity,
    area = nullif(btrim(p_asset->>'area'), ''), observations = nullif(btrim(p_asset->>'observations'), ''), updated_by = v_actor
  where id = p_asset_id;

  if v_family_code = 'computer' then
    insert into public.computer_details(asset_id, memory, storage, screen, keyboard, battery, charger)
    values (p_asset_id, nullif(btrim(p_details->>'memory'), ''), nullif(btrim(p_details->>'storage'), ''), nullif(btrim(p_details->>'screen'), ''), nullif(btrim(p_details->>'keyboard'), ''), nullif(btrim(p_details->>'battery'), ''), nullif(btrim(p_details->>'charger'), ''))
    on conflict (asset_id) do update set memory = excluded.memory, storage = excluded.storage, screen = excluded.screen, keyboard = excluded.keyboard, battery = excluded.battery, charger = excluded.charger;
  elsif v_family_code = 'projector' then
    insert into public.projector_details(asset_id, lumens, hdmi, vga)
    values (p_asset_id, nullif(btrim(p_details->>'lumens'), ''), nullif(btrim(p_details->>'hdmi'), ''), nullif(btrim(p_details->>'vga'), ''))
    on conflict (asset_id) do update set lumens = excluded.lumens, hdmi = excluded.hdmi, vga = excluded.vga;
  elsif v_family_code = 'television' then
    insert into public.television_details(asset_id, size)
    values (p_asset_id, nullif(btrim(p_details->>'size'), ''))
    on conflict (asset_id) do update set size = excluded.size;
  end if;

  select to_jsonb(a) into v_after from public.assets a where a.id = p_asset_id;
  insert into public.asset_history(asset_id, event_type, description, before_data, after_data, actor_id)
  values (p_asset_id, 'updated', 'Activo actualizado desde la aplicación web.', v_before, v_after, v_actor);
end;
$$;

revoke execute on function public.create_asset_atomic(jsonb, jsonb) from public, anon;
revoke execute on function public.update_asset_atomic(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.create_asset_atomic(jsonb, jsonb) to authenticated;
grant execute on function public.update_asset_atomic(uuid, jsonb, jsonb) to authenticated;

comment on function public.create_asset_atomic(jsonb, jsonb) is 'Crea activo, detalles de familia e historial en una sola transacción.';
comment on function public.update_asset_atomic(uuid, jsonb, jsonb) is 'Actualiza activo, detalles de familia e historial en una sola transacción.';
