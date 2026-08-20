-- Permite que la API administrativa de servidor cree perfiles sin requerir
-- privilegios SELECT directos sobre auth.users.
--
-- La integridad usuario/perfil continúa garantizada por:
--   profiles.id -> auth.users(id) ON DELETE CASCADE
-- El correo del perfil continúa siendo UNIQUE y el administrador raíz
-- conserva sus protecciones específicas.

-- Este trigger ejecutaba SELECT sobre auth.users como SECURITY INVOKER.
-- Las llamadas realizadas por la Secret Key usan el rol service_role, que
-- puede administrar public.profiles pero no tiene SELECT directo sobre
-- auth.users. Por eso Auth creaba correctamente la cuenta, pero el upsert
-- posterior del perfil fallaba.
drop trigger if exists profiles_validate_auth_identity on public.profiles;
drop function if exists public.validate_profile_auth_identity();

comment on table public.profiles is
  'Perfiles de acceso del inventario. id referencia auth.users(id); la creación y administración de usuarios se realiza desde el backend con Supabase Auth Admin API.';
