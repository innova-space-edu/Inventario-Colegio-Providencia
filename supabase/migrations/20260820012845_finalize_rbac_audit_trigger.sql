create schema if not exists private;
revoke all on schema private from public,anon,authenticated;

create or replace function private.audit_inventory_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
  v_record_id text;
begin
  if v_actor is null then raise exception 'Usuario no autenticado'; end if;

  if tg_table_name='assets' and tg_op='INSERT' and not public.has_permission('inventory.create') then
    raise exception 'Permiso inventory.create requerido';
  end if;
  if tg_table_name='assets' and tg_op='UPDATE' and not (public.has_permission('inventory.edit') or public.has_permission('inventory.dispose') or public.has_permission('inventory.reactivate')) then
    raise exception 'Permiso de modificación requerido';
  end if;
  if tg_table_name='asset_disposals' and tg_op='INSERT' and not public.has_permission('inventory.dispose') then
    raise exception 'Permiso inventory.dispose requerido';
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

revoke execute on function private.audit_inventory_change() from public,anon,authenticated;
drop trigger if exists assets_audit on public.assets;
drop trigger if exists asset_disposals_audit on public.asset_disposals;
create trigger assets_audit after insert or update or delete on public.assets for each row execute function private.audit_inventory_change();
create trigger asset_disposals_audit after insert or update or delete on public.asset_disposals for each row execute function private.audit_inventory_change();
drop function if exists public.audit_inventory_change();
