-- Permite que la migración controlada con service_role atraviese el trigger
-- de auditoría sin debilitar los permisos de usuarios autenticados.

create or replace function private.audit_inventory_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_record_id text;
  v_effective_role text := current_setting('role', true);
begin
  if v_actor is null and v_effective_role <> 'service_role' then
    raise exception 'Usuario no autenticado';
  end if;

  if v_actor is not null then
    if tg_table_name='assets' and tg_op='INSERT' and not public.has_permission('inventory.create') then
      raise exception 'Permiso inventory.create requerido';
    end if;
    if tg_table_name='assets' and tg_op='UPDATE' and not (public.has_permission('inventory.edit') or public.has_permission('inventory.dispose') or public.has_permission('inventory.reactivate')) then
      raise exception 'Permiso de modificación requerido';
    end if;
    if tg_table_name='asset_disposals' and tg_op='INSERT' and not public.has_permission('inventory.dispose') then
      raise exception 'Permiso inventory.dispose requerido';
    end if;
  end if;

  v_record_id := case when tg_op='DELETE' then old.id::text else new.id::text end;

  insert into public.audit_logs(actor_id,action,table_name,record_id,before_data,after_data)
  values(
    v_actor,
    tg_op,
    tg_table_name,
    v_record_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

revoke execute on function private.audit_inventory_change() from public, anon, authenticated;
