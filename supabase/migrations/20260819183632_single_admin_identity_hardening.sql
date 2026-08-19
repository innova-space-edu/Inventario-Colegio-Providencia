-- Endurecimiento del único administrador del Inventario Colegio Providencia.

create unique index if not exists profiles_single_active_admin_unique
  on public.profiles ((1))
  where role = 'admin' and active = true;

create or replace function public.validate_profile_auth_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_auth_email text;
begin
  select u.email into v_auth_email
  from auth.users u
  where u.id = new.id;

  if v_auth_email is null then
    raise exception 'El perfil debe corresponder a un usuario existente en Supabase Auth';
  end if;

  if lower(v_auth_email) <> lower(new.email) then
    raise exception 'El correo del perfil debe coincidir con el correo del usuario de Supabase Auth';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_validate_auth_identity on public.profiles;
create trigger profiles_validate_auth_identity
before insert or update of id, email on public.profiles
for each row execute function public.validate_profile_auth_identity();

revoke execute on function public.validate_profile_auth_identity() from public, anon, authenticated;

comment on index public.profiles_single_active_admin_unique is
  'Garantiza que el inventario tenga como máximo un administrador activo.';
