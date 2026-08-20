-- Corrige la cadena de autorización RBAC para sesiones authenticated.
-- Los wrappers públicos (is_root_admin, has_permission y get_my_permission_codes)
-- ejecutan helpers seguros del esquema private. El esquema sigue sin exponer tablas
-- ni otros helpers porque solo se concede USAGE y EXECUTE sobre estas funciones concretas.

grant usage on schema private to authenticated;

grant execute on function private.current_user_is_root_admin() to authenticated;
grant execute on function private.current_user_has_permission(text) to authenticated;
grant execute on function private.current_user_permission_codes() to authenticated;

comment on function private.current_user_is_root_admin() is
  'Helper seguro para comprobar si la sesión autenticada corresponde al superadministrador raíz.';
comment on function private.current_user_has_permission(text) is
  'Helper seguro para resolver un permiso efectivo de la sesión autenticada.';
comment on function private.current_user_permission_codes() is
  'Helper seguro para devolver los permisos efectivos de la sesión autenticada.';
