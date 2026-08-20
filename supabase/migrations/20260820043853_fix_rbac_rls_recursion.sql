-- Evita recursión RLS en los helpers de autorización RBAC.
-- Los lookups privilegiados se mantienen en un esquema no expuesto y siempre
-- validan la identidad actual mediante auth.uid().

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.current_user_is_root_admin()
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
      from public.profiles p
      where p.id = (select auth.uid())
        and lower(p.email) = lower('admin@colprovidencia.cl')
        and p.role = 'admin'
        and p.active = true
    )
  end;
$$;

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

revoke execute on function private.current_user_is_root_admin() from public, anon;
revoke execute on function private.current_user_has_permission(text) from public, anon;
grant execute on function private.current_user_is_root_admin() to authenticated;
grant execute on function private.current_user_has_permission(text) to authenticated;

create or replace function public.is_root_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.current_user_is_root_admin();
$$;

create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.current_user_has_permission(p_permission);
$$;

revoke execute on function public.is_root_admin() from public, anon;
revoke execute on function public.has_permission(text) from public, anon;
grant execute on function public.is_root_admin() to authenticated;
grant execute on function public.has_permission(text) to authenticated;
