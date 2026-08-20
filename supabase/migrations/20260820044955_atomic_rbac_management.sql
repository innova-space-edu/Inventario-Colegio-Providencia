-- Operaciones RBAC que no deben dejar estados parciales.

create or replace function public.replace_user_role_atomic(
  p_user_id uuid,
  p_role_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_role_code text;
  v_target_email text;
begin
  if not public.is_root_admin() then
    raise exception 'Administrador raíz requerido';
  end if;

  select p.email into v_target_email
  from public.profiles p
  where p.id = p_user_id;

  if v_target_email is null then
    raise exception 'Usuario no encontrado';
  end if;

  if lower(v_target_email) = lower('admin@colprovidencia.cl') then
    raise exception 'El administrador raíz está protegido';
  end if;

  select r.code into v_role_code
  from public.app_roles r
  where r.id = p_role_id and r.active = true;

  if v_role_code is null or v_role_code = 'super_admin' then
    raise exception 'Rol inválido o protegido';
  end if;

  delete from public.user_roles
  where user_id = p_user_id;

  insert into public.user_roles(user_id, role_id, assigned_by)
  values (p_user_id, p_role_id, auth.uid());
end;
$$;

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
  v_role_code text;
  v_invalid_count integer;
begin
  if not public.is_root_admin() then
    raise exception 'Administrador raíz requerido';
  end if;

  select r.code into v_role_code
  from public.app_roles r
  where r.id = p_role_id;

  if v_role_code is null or v_role_code = 'super_admin' then
    raise exception 'Rol inválido o protegido';
  end if;

  select count(*) into v_invalid_count
  from unnest(coalesce(p_permissions, array[]::text[])) as requested(code)
  where not exists (
    select 1 from public.app_permissions ap where ap.code = requested.code
  );

  if v_invalid_count > 0 then
    raise exception 'La lista contiene permisos inválidos';
  end if;

  delete from public.role_permissions
  where role_id = p_role_id;

  insert into public.role_permissions(role_id, permission_code)
  select p_role_id, requested.code
  from (
    select distinct unnest(coalesce(p_permissions, array[]::text[])) as code
  ) requested;
end;
$$;

revoke execute on function public.replace_user_role_atomic(uuid, uuid) from public, anon;
revoke execute on function public.replace_role_permissions_atomic(uuid, text[]) from public, anon;
grant execute on function public.replace_user_role_atomic(uuid, uuid) to authenticated;
grant execute on function public.replace_role_permissions_atomic(uuid, text[]) to authenticated;

comment on function public.replace_user_role_atomic(uuid, uuid) is
  'Reemplaza los roles de un usuario por un único rol activo en una transacción, solo root admin.';
comment on function public.replace_role_permissions_atomic(uuid, text[]) is
  'Reemplaza todos los permisos de un rol en una transacción, solo root admin.';
