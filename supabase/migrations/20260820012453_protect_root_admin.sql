create or replace function public.protect_root_admin_profile()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if lower(old.email)=lower('admin@colprovidencia.cl') then
    if tg_op='DELETE' then raise exception 'El administrador raíz no puede eliminarse'; end if;
    if lower(new.email)<>lower('admin@colprovidencia.cl') or new.role<>'admin' or new.active<>true then raise exception 'El administrador raíz debe permanecer activo con rol admin'; end if;
  end if;
  if tg_op='DELETE' then return old; end if; return new;
end;$$;
revoke execute on function public.protect_root_admin_profile() from public,anon,authenticated;
drop trigger if exists profiles_protect_root_admin on public.profiles;
create trigger profiles_protect_root_admin before update or delete on public.profiles for each row execute function public.protect_root_admin_profile();

create or replace function public.protect_super_admin_assignment()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_role_code text; v_email text;
begin
  if tg_op='DELETE' then
    select r.code into v_role_code from public.app_roles r where r.id=old.role_id;
    select p.email into v_email from public.profiles p where p.id=old.user_id;
    if v_role_code='super_admin' and lower(coalesce(v_email,''))=lower('admin@colprovidencia.cl') then raise exception 'No se puede retirar super_admin al administrador raíz'; end if;
    return old;
  end if;
  select r.code into v_role_code from public.app_roles r where r.id=new.role_id;
  if v_role_code='super_admin' then
    select p.email into v_email from public.profiles p where p.id=new.user_id;
    if lower(coalesce(v_email,''))<>lower('admin@colprovidencia.cl') then raise exception 'super_admin está reservado para admin@colprovidencia.cl'; end if;
  end if;
  return new;
end;$$;
revoke execute on function public.protect_super_admin_assignment() from public,anon,authenticated;
drop trigger if exists user_roles_protect_super_admin on public.user_roles;
create trigger user_roles_protect_super_admin before insert or update or delete on public.user_roles for each row execute function public.protect_super_admin_assignment();
