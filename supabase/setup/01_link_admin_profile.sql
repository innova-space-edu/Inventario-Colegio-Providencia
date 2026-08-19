-- Inventario Colegio Providencia
-- Vincula un usuario EXISTENTE de Supabase Auth con el único perfil administrador.
--
-- PASOS:
-- 1) En Supabase > Authentication > Users crea primero el usuario administrador.
-- 2) Reemplaza TU_CORREO_ADMIN@DOMINIO.CL por el mismo correo.
-- 3) Ejecuta este script desde SQL Editor.
--
-- Este script NO crea usuarios de Auth y NO almacena contraseñas.
-- Si ya había otro administrador activo, lo desactiva antes de activar el nuevo.

do $$
declare
  v_email text := 'TU_CORREO_ADMIN@DOMINIO.CL';
  v_user_id uuid;
begin
  select id
    into v_user_id
  from auth.users
  where lower(email) = lower(v_email)
  limit 1;

  if v_user_id is null then
    raise exception 'No existe un usuario en Supabase Auth con el correo %', v_email;
  end if;

  lock table public.profiles in share row exclusive mode;

  update public.profiles
     set active = false,
         updated_at = now()
   where role = 'admin'
     and active = true
     and id <> v_user_id;

  insert into public.profiles (id, email, role, active)
  values (v_user_id, v_email, 'admin', true)
  on conflict (id) do update
    set email = excluded.email,
        role = 'admin',
        active = true,
        updated_at = now();
end
$$;
