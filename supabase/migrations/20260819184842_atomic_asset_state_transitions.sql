-- Transiciones atómicas para bajas y reactivaciones del inventario.

create or replace function public.dispose_asset_atomic(
  p_asset_id uuid,
  p_reason text,
  p_observations text default null,
  p_approved_by text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_status_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_is_disposed boolean;
begin
  if v_actor is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_actor and p.role = 'admin' and p.active = true
  ) then
    raise exception 'Acceso administrativo requerido';
  end if;

  select to_jsonb(a), a.is_disposed
    into v_before, v_is_disposed
  from public.assets a
  where a.id = p_asset_id
  for update;

  if v_before is null then
    raise exception 'Activo no encontrado';
  end if;

  if v_is_disposed then
    raise exception 'El activo ya se encuentra dado de baja';
  end if;

  select s.id
    into v_status_id
  from public.asset_statuses s
  where s.code = 'disposed' and s.active = true
  limit 1;

  if v_status_id is null then
    raise exception 'No existe el estado disposed';
  end if;

  update public.assets
     set is_disposed = true,
         status_id = v_status_id,
         updated_by = v_actor
   where id = p_asset_id;

  select to_jsonb(a)
    into v_after
  from public.assets a
  where a.id = p_asset_id;

  insert into public.asset_disposals(
    asset_id, reason, observations, approved_by, created_by
  ) values (
    p_asset_id, nullif(btrim(p_reason), ''), nullif(btrim(p_observations), ''),
    nullif(btrim(p_approved_by), ''), v_actor
  );

  insert into public.asset_history(
    asset_id, event_type, description, before_data, after_data, actor_id
  ) values (
    p_asset_id,
    'disposed',
    coalesce(nullif(btrim(p_reason), ''), 'Activo dado de baja.'),
    v_before,
    v_after,
    v_actor
  );
end;
$$;

create or replace function public.reactivate_asset_atomic(
  p_asset_id uuid,
  p_reason text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_status_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_is_disposed boolean;
begin
  if v_actor is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_actor and p.role = 'admin' and p.active = true
  ) then
    raise exception 'Acceso administrativo requerido';
  end if;

  select to_jsonb(a), a.is_disposed
    into v_before, v_is_disposed
  from public.assets a
  where a.id = p_asset_id
  for update;

  if v_before is null then
    raise exception 'Activo no encontrado';
  end if;

  if not v_is_disposed then
    raise exception 'El activo no está dado de baja';
  end if;

  select s.id
    into v_status_id
  from public.asset_statuses s
  where s.code = 'operational' and s.active = true
  limit 1;

  if v_status_id is null then
    raise exception 'No existe el estado operational';
  end if;

  update public.assets
     set is_disposed = false,
         status_id = v_status_id,
         updated_by = v_actor
   where id = p_asset_id;

  select to_jsonb(a)
    into v_after
  from public.assets a
  where a.id = p_asset_id;

  insert into public.asset_history(
    asset_id, event_type, description, before_data, after_data, actor_id
  ) values (
    p_asset_id,
    'reactivated',
    'Reactivado: ' || coalesce(nullif(btrim(p_reason), ''), 'sin detalle'),
    v_before,
    v_after,
    v_actor
  );
end;
$$;

revoke execute on function public.dispose_asset_atomic(uuid, text, text, text) from public, anon;
revoke execute on function public.reactivate_asset_atomic(uuid, text) from public, anon;
grant execute on function public.dispose_asset_atomic(uuid, text, text, text) to authenticated;
grant execute on function public.reactivate_asset_atomic(uuid, text) to authenticated;

comment on function public.dispose_asset_atomic(uuid, text, text, text) is
  'Transición atómica de activo vigente a dado de baja, incluyendo registro de baja e historial.';
comment on function public.reactivate_asset_atomic(uuid, text) is
  'Transición atómica de activo dado de baja a operativo, conservando antecedentes de baja e historial.';
