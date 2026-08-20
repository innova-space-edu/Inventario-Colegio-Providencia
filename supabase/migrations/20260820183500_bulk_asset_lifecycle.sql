create or replace function public.set_assets_lifecycle_bulk_atomic(
  p_asset_ids uuid[],
  p_action text,
  p_reason text,
  p_observations text default null,
  p_approved_by text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_is_disposed boolean;
  v_changed integer := 0;
  v_skipped integer := 0;
  v_total integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if p_action not in ('dispose', 'reactivate') then
    raise exception 'Acción de ciclo de vida inválida';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'El motivo es obligatorio';
  end if;

  if coalesce(cardinality(p_asset_ids), 0) = 0 then
    raise exception 'Debes seleccionar al menos un activo';
  end if;

  if cardinality(p_asset_ids) > 100 then
    raise exception 'El lote no puede superar 100 activos';
  end if;

  if not public.has_permission('inventory.view') then
    raise exception 'Permiso inventory.view requerido';
  end if;

  if p_action = 'dispose' and not public.has_permission('inventory.dispose') then
    raise exception 'Permiso inventory.dispose requerido';
  end if;

  if p_action = 'reactivate' and not public.has_permission('inventory.reactivate') then
    raise exception 'Permiso inventory.reactivate requerido';
  end if;

  for v_id in
    select distinct selected_id
    from unnest(p_asset_ids) as selected(selected_id)
  loop
    v_total := v_total + 1;

    select a.is_disposed
      into v_is_disposed
    from public.assets a
    where a.id = v_id
    for update;

    if not found then
      raise exception 'Activo no encontrado: %', v_id;
    end if;

    if p_action = 'dispose' then
      if v_is_disposed then
        v_skipped := v_skipped + 1;
      else
        perform public.dispose_asset_atomic(
          v_id,
          p_reason,
          p_observations,
          p_approved_by
        );
        v_changed := v_changed + 1;
      end if;
    else
      if not v_is_disposed then
        v_skipped := v_skipped + 1;
      else
        perform public.reactivate_asset_atomic(v_id, p_reason);
        v_changed := v_changed + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'action', p_action,
    'selected', v_total,
    'changed', v_changed,
    'skipped', v_skipped
  );
end;
$$;

revoke execute on function public.set_assets_lifecycle_bulk_atomic(uuid[], text, text, text, text)
  from public, anon;
grant execute on function public.set_assets_lifecycle_bulk_atomic(uuid[], text, text, text, text)
  to authenticated;

comment on function public.set_assets_lifecycle_bulk_atomic(uuid[], text, text, text, text) is
  'Cambia en un solo lote transaccional el estado de activos seleccionados. Reutiliza las RPC atómicas de baja/reactivación, conserva historial y omite activos que ya están en el estado solicitado.';
