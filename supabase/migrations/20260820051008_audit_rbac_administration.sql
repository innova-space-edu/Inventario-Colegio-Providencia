-- Auditoría de cambios administrativos de perfiles, roles y permisos.

create or replace function private.audit_rbac_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_effective_role text := current_setting('role', true);
  v_record_id text;
begin
  if v_actor is null and v_effective_role <> 'service_role' then
    raise exception 'Usuario no autenticado';
  end if;

  if v_actor is not null and not private.current_user_is_root_admin() then
    raise exception 'Administrador raíz requerido';
  end if;

  if tg_table_name = 'profiles' then
    v_record_id := case when tg_op = 'DELETE' then old.id::text else new.id::text end;
  elsif tg_table_name = 'app_roles' then
    v_record_id := case when tg_op = 'DELETE' then old.id::text else new.id::text end;
  elsif tg_table_name = 'user_roles' then
    v_record_id := case
      when tg_op = 'DELETE' then old.user_id::text || ':' || old.role_id::text
      else new.user_id::text || ':' || new.role_id::text
    end;
  elsif tg_table_name = 'role_permissions' then
    v_record_id := case
      when tg_op = 'DELETE' then old.role_id::text || ':' || old.permission_code
      else new.role_id::text || ':' || new.permission_code
    end;
  else
    raise exception 'Tabla administrativa no permitida para auditoría: %', tg_table_name;
  end if;

  insert into public.audit_logs(actor_id,action,table_name,record_id,before_data,after_data)
  values(
    v_actor,
    tg_op,
    tg_table_name,
    v_record_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke execute on function private.audit_rbac_change() from public, anon, authenticated;

drop trigger if exists profiles_audit_rbac_change on public.profiles;
create trigger profiles_audit_rbac_change
after insert or update or delete on public.profiles
for each row execute function private.audit_rbac_change();

drop trigger if exists app_roles_audit_rbac_change on public.app_roles;
create trigger app_roles_audit_rbac_change
after insert or update or delete on public.app_roles
for each row execute function private.audit_rbac_change();

drop trigger if exists user_roles_audit_rbac_change on public.user_roles;
create trigger user_roles_audit_rbac_change
after insert or update or delete on public.user_roles
for each row execute function private.audit_rbac_change();

drop trigger if exists role_permissions_audit_rbac_change on public.role_permissions;
create trigger role_permissions_audit_rbac_change
after insert or update or delete on public.role_permissions
for each row execute function private.audit_rbac_change();

comment on function private.audit_rbac_change() is
  'Audita cambios administrativos de perfiles, roles y permisos. Usuarios normales no pueden invocarla ni producir cambios RBAC.';
