-- Rol Administrador delegado para Inventario Colegio Providencia.
-- Mantiene a admin@colprovidencia.cl como único superadministrador protegido.

-- La auditoría debe aceptar cambios RBAC autorizados por permisos y operaciones de servicio/migración.
create or replace function private.audit_rbac_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_record_id text;
begin
  if v_actor is not null then
    if tg_table_name = 'profiles' and not public.has_permission('users.manage') then
      raise exception 'Permiso users.manage requerido';
    elsif tg_table_name = 'app_roles' and tg_op = 'INSERT' and not public.has_permission('roles.create') then
      raise exception 'Permiso roles.create requerido';
    elsif tg_table_name = 'app_roles' and tg_op = 'UPDATE' and not public.has_permission('roles.edit') then
      raise exception 'Permiso roles.edit requerido';
    elsif tg_table_name = 'app_roles' and tg_op = 'DELETE' and not public.has_permission('roles.delete') then
      raise exception 'Permiso roles.delete requerido';
    elsif tg_table_name = 'user_roles' and not public.has_permission('users.assign_roles') then
      raise exception 'Permiso users.assign_roles requerido';
    elsif tg_table_name = 'role_permissions' and not public.has_permission('roles.manage_permissions') then
      raise exception 'Permiso roles.manage_permissions requerido';
    end if;
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

-- Administrador de aplicación: acceso total a permisos funcionales, sin identidad root.
create or replace function private.current_user_is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then false
    else exists (
      select 1
      from public.user_roles ur
      join public.app_roles r on r.id = ur.role_id
      where ur.user_id = (select auth.uid())
        and r.code = 'admin'
        and r.active = true
    )
  end;
$$;

revoke execute on function private.current_user_is_app_admin() from public, anon, authenticated;

create or replace function private.current_user_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then false
    when private.current_user_is_root_admin() then true
    when private.current_user_is_app_admin() then true
    else exists (
      select 1
      from public.user_roles ur
      join public.app_roles r
        on r.id = ur.role_id
       and r.active = true
      join public.role_permissions rp
        on rp.role_id = r.id
      where ur.user_id = (select auth.uid())
        and rp.permission_code = p_permission
    )
  end;
$$;

revoke execute on function private.current_user_has_permission(text) from public, anon, authenticated;

-- Helpers de protección para políticas y acciones atómicas.
create or replace function private.user_is_root(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and lower(p.email) = lower('admin@colprovidencia.cl')
  );
$$;

create or replace function private.role_is_protected(p_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_roles r
    where r.id = p_role_id
      and r.code in ('super_admin','admin')
  );
$$;

create or replace function private.role_is_assignable(p_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_roles r
    where r.id = p_role_id
      and r.active = true
      and r.code <> 'super_admin'
  );
$$;

revoke execute on function private.user_is_root(uuid) from public, anon, authenticated;
revoke execute on function private.role_is_protected(uuid) from public, anon, authenticated;
revoke execute on function private.role_is_assignable(uuid) from public, anon, authenticated;

create or replace function public.is_root_user(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.user_is_root(p_user_id); $$;

create or replace function public.is_protected_role(p_role_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.role_is_protected(p_role_id); $$;

create or replace function public.is_assignable_role(p_role_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.role_is_assignable(p_role_id); $$;

revoke execute on function public.is_root_user(uuid) from public, anon;
revoke execute on function public.is_protected_role(uuid) from public, anon;
revoke execute on function public.is_assignable_role(uuid) from public, anon;
grant execute on function public.is_root_user(uuid) to authenticated;
grant execute on function public.is_protected_role(uuid) to authenticated;
grant execute on function public.is_assignable_role(uuid) to authenticated;

-- Rol fijo de administrador y nombre explícito del root.
update public.app_roles
set name = 'Superadministrador',
    description = 'Control total y cuenta raíz protegida del Inventario Colegio Providencia.',
    is_system = true,
    active = true,
    updated_at = now()
where code = 'super_admin';

insert into public.app_roles(code,name,description,is_system,active)
values(
  'admin',
  'Administrador',
  'Administración completa del inventario y de sus usuarios, sin capacidad de modificar al superadministrador.',
  true,
  true
)
on conflict(code) do update
set name = excluded.name,
    description = excluded.description,
    is_system = true,
    active = true,
    updated_at = now();

insert into public.role_permissions(role_id,permission_code)
select r.id, p.code
from public.app_roles r
cross join public.app_permissions p
where r.code in ('super_admin','admin')
on conflict do nothing;

-- Devuelve solo los permisos efectivos del usuario actual.
create or replace function private.current_user_permission_codes()
returns table(permission_code text)
language sql
stable
security definer
set search_path = ''
as $$
  select ap.code
  from public.app_permissions ap
  where (select auth.uid()) is not null
    and (
      private.current_user_is_root_admin()
      or private.current_user_is_app_admin()
      or exists (
        select 1
        from public.user_roles ur
        join public.app_roles r
          on r.id = ur.role_id
         and r.active = true
        join public.role_permissions rp
          on rp.role_id = r.id
        where ur.user_id = (select auth.uid())
          and rp.permission_code = ap.code
      )
    )
  order by ap.code;
$$;

revoke execute on function private.current_user_permission_codes() from public, anon, authenticated;

create or replace function public.get_my_permission_codes()
returns table(code text)
language sql
stable
security invoker
set search_path = ''
as $$
  select permission_code as code
  from private.current_user_permission_codes();
$$;

revoke execute on function public.get_my_permission_codes() from public, anon;
grant execute on function public.get_my_permission_codes() to authenticated;

-- Asignación de roles: admin y root pueden administrar a otros usuarios; super_admin nunca es asignable.
create or replace function public.replace_user_role_atomic(
  p_user_id uuid,
  p_role_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.has_permission('users.assign_roles') then
    raise exception 'Permiso users.assign_roles requerido';
  end if;

  if private.user_is_root(p_user_id) then
    raise exception 'El superadministrador está protegido';
  end if;

  if not private.role_is_assignable(p_role_id) then
    raise exception 'Rol inválido o protegido';
  end if;

  if not exists(select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'Usuario no encontrado';
  end if;

  delete from public.user_roles where user_id = p_user_id;
  insert into public.user_roles(user_id, role_id, assigned_by)
  values (p_user_id, p_role_id, auth.uid());
end;
$$;

-- Permisos de roles: admin y super_admin son roles fijos del sistema y no se editan desde la app.
create or replace function public.replace_role_permissions_atomic(
  p_role_id uuid,
  p_permissions text[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invalid_count integer;
begin
  if not public.has_permission('roles.manage_permissions') then
    raise exception 'Permiso roles.manage_permissions requerido';
  end if;

  if private.role_is_protected(p_role_id) then
    raise exception 'Rol protegido';
  end if;

  if not exists(select 1 from public.app_roles r where r.id = p_role_id) then
    raise exception 'Rol no encontrado';
  end if;

  select count(*) into v_invalid_count
  from unnest(coalesce(p_permissions, array[]::text[])) as requested(code)
  where not exists (
    select 1 from public.app_permissions ap where ap.code = requested.code
  );

  if v_invalid_count > 0 then
    raise exception 'La lista contiene permisos inválidos';
  end if;

  delete from public.role_permissions where role_id = p_role_id;

  insert into public.role_permissions(role_id, permission_code)
  select p_role_id, requested.code
  from (
    select distinct unnest(coalesce(p_permissions, array[]::text[])) as code
  ) requested;
end;
$$;

create or replace function public.set_managed_user_active_atomic(
  p_user_id uuid,
  p_active boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.has_permission('users.manage') then
    raise exception 'Permiso users.manage requerido';
  end if;

  if private.user_is_root(p_user_id) then
    raise exception 'El superadministrador está protegido';
  end if;

  update public.profiles
  set active = p_active,
      updated_at = now()
  where id = p_user_id;

  if not found then raise exception 'Usuario no encontrado'; end if;
end;
$$;

revoke execute on function public.replace_user_role_atomic(uuid,uuid) from public, anon;
revoke execute on function public.replace_role_permissions_atomic(uuid,text[]) from public, anon;
revoke execute on function public.set_managed_user_active_atomic(uuid,boolean) from public, anon;
grant execute on function public.replace_user_role_atomic(uuid,uuid) to authenticated;
grant execute on function public.replace_role_permissions_atomic(uuid,text[]) to authenticated;
grant execute on function public.set_managed_user_active_atomic(uuid,boolean) to authenticated;

-- Defensa adicional: los roles admin/super_admin no pueden alterarse desde una sesión de usuario.
create or replace function private.protect_system_role_integrity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if old.code in ('super_admin','admin') then
    raise exception 'Rol administrativo protegido';
  end if;

  if tg_op = 'DELETE' then
    if old.is_system then raise exception 'Los roles del sistema no pueden eliminarse'; end if;
    return old;
  end if;

  if new.code in ('super_admin','admin') then
    raise exception 'Código de rol reservado';
  end if;

  if old.is_system and (new.code <> old.code or new.is_system <> old.is_system) then
    raise exception 'La identidad de un rol del sistema no puede modificarse';
  end if;

  if not old.is_system and new.is_system then
    raise exception 'Un rol personalizado no puede convertirse en rol del sistema';
  end if;

  return new;
end;
$$;

revoke execute on function private.protect_system_role_integrity() from public, anon, authenticated;
drop trigger if exists app_roles_protect_system_integrity on public.app_roles;
create trigger app_roles_protect_system_integrity
before update or delete on public.app_roles
for each row execute function private.protect_system_role_integrity();

-- RLS administrativo por permisos, siempre excluyendo al usuario raíz y los roles protegidos.
drop policy if exists app_roles_insert on public.app_roles;
create policy app_roles_insert on public.app_roles
for insert to authenticated
with check (
  public.has_permission('roles.create')
  and code not in ('super_admin','admin')
  and is_system = false
);

drop policy if exists app_roles_update on public.app_roles;
create policy app_roles_update on public.app_roles
for update to authenticated
using (public.has_permission('roles.edit') and code not in ('super_admin','admin'))
with check (public.has_permission('roles.edit') and code not in ('super_admin','admin'));

drop policy if exists app_roles_delete on public.app_roles;
create policy app_roles_delete on public.app_roles
for delete to authenticated
using (
  public.has_permission('roles.delete')
  and is_system = false
  and code not in ('super_admin','admin')
);

drop policy if exists role_permissions_insert on public.role_permissions;
create policy role_permissions_insert on public.role_permissions
for insert to authenticated
with check (
  public.has_permission('roles.manage_permissions')
  and not public.is_protected_role(role_id)
);

drop policy if exists role_permissions_delete on public.role_permissions;
create policy role_permissions_delete on public.role_permissions
for delete to authenticated
using (
  public.has_permission('roles.manage_permissions')
  and not public.is_protected_role(role_id)
);

drop policy if exists user_roles_insert on public.user_roles;
create policy user_roles_insert on public.user_roles
for insert to authenticated
with check (
  public.has_permission('users.assign_roles')
  and not public.is_root_user(user_id)
  and public.is_assignable_role(role_id)
);

drop policy if exists user_roles_update on public.user_roles;
create policy user_roles_update on public.user_roles
for update to authenticated
using (
  public.has_permission('users.assign_roles')
  and not public.is_root_user(user_id)
)
with check (
  public.has_permission('users.assign_roles')
  and not public.is_root_user(user_id)
  and public.is_assignable_role(role_id)
);

drop policy if exists user_roles_delete on public.user_roles;
create policy user_roles_delete on public.user_roles
for delete to authenticated
using (
  public.has_permission('users.assign_roles')
  and not public.is_root_user(user_id)
);

drop policy if exists profiles_root_update on public.profiles;
drop policy if exists profiles_manage_update on public.profiles;
create policy profiles_manage_update on public.profiles
for update to authenticated
using (
  public.has_permission('users.manage')
  and not public.is_root_user(id)
)
with check (
  public.has_permission('users.manage')
  and not public.is_root_user(id)
);

comment on function public.get_my_permission_codes() is 'Permisos efectivos del usuario autenticado; admin y super_admin reciben todos los permisos funcionales.';
comment on function public.set_managed_user_active_atomic(uuid,boolean) is 'Activa o desactiva usuarios administrados sin permitir cambios al superadministrador.';
