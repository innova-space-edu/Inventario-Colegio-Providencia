-- Corrige los helpers privados utilizados por las políticas/RPC RBAC.
-- El fallo observado era `permission denied for function user_is_root` al asignar roles.

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

revoke execute on function private.user_is_root(uuid) from public, anon;
revoke execute on function private.role_is_assignable(uuid) from public, anon;
revoke execute on function private.role_is_protected(uuid) from public, anon;

grant execute on function private.user_is_root(uuid) to authenticated, service_role;
grant execute on function private.role_is_assignable(uuid) to authenticated, service_role;
grant execute on function private.role_is_protected(uuid) to authenticated, service_role;

-- Nombres y descripciones consistentes para los roles integrados.
update public.app_roles
set name = 'Superadministrador',
    description = 'Cuenta raíz protegida con control total de la plataforma.'
where code = 'super_admin';

update public.app_roles
set name = 'Administrador',
    description = 'Acceso completo a la plataforma, excepto modificar o eliminar al Superadministrador.'
where code = 'admin';

update public.app_roles
set name = 'Encargado de inventario',
    description = 'Administra activos, ubicaciones, bajas, calidad de datos, informes y auditoría.'
where code = 'inventory_manager';

update public.app_roles
set name = 'Operador de inventario',
    description = 'Puede consultar, crear y editar activos, además de consultar ubicaciones, calidad e informes.'
where code = 'inventory_operator';

update public.app_roles
set name = 'Observador',
    description = 'Solo lectura: puede consultar inventario, ubicaciones e informes, sin modificar información.'
where code = 'viewer';

-- Garantiza la matriz exacta de permisos de los roles integrados sin afectar roles personalizados.
insert into public.role_permissions(role_id, permission_code)
select r.id, p.code
from public.app_roles r
cross join public.app_permissions p
where r.code in ('super_admin', 'admin')
on conflict do nothing;

-- Encargado de inventario.
delete from public.role_permissions rp
using public.app_roles r
where rp.role_id = r.id
  and r.code = 'inventory_manager'
  and rp.permission_code not in (
    'inventory.view','inventory.create','inventory.edit','inventory.dispose','inventory.reactivate',
    'locations.view','locations.manage','reports.view','reports.export',
    'quality.view','quality.manage','audit.view'
  );
insert into public.role_permissions(role_id, permission_code)
select r.id, p.code
from public.app_roles r
join public.app_permissions p on p.code in (
  'inventory.view','inventory.create','inventory.edit','inventory.dispose','inventory.reactivate',
  'locations.view','locations.manage','reports.view','reports.export',
  'quality.view','quality.manage','audit.view'
)
where r.code = 'inventory_manager'
on conflict do nothing;

-- Operador de inventario.
delete from public.role_permissions rp
using public.app_roles r
where rp.role_id = r.id
  and r.code = 'inventory_operator'
  and rp.permission_code not in (
    'inventory.view','inventory.create','inventory.edit',
    'locations.view','reports.view','quality.view'
  );
insert into public.role_permissions(role_id, permission_code)
select r.id, p.code
from public.app_roles r
join public.app_permissions p on p.code in (
  'inventory.view','inventory.create','inventory.edit',
  'locations.view','reports.view','quality.view'
)
where r.code = 'inventory_operator'
on conflict do nothing;

-- Observador / solo lectura.
delete from public.role_permissions rp
using public.app_roles r
where rp.role_id = r.id
  and r.code = 'viewer'
  and rp.permission_code not in ('inventory.view','locations.view','reports.view');
insert into public.role_permissions(role_id, permission_code)
select r.id, p.code
from public.app_roles r
join public.app_permissions p on p.code in ('inventory.view','locations.view','reports.view')
where r.code = 'viewer'
on conflict do nothing;

comment on function private.user_is_root(uuid) is
  'Helper protegido usado por RLS/RPC para impedir cambios sobre el Superadministrador.';
comment on function private.role_is_assignable(uuid) is
  'Helper protegido que permite asignar roles activos excepto super_admin.';
comment on function private.role_is_protected(uuid) is
  'Helper protegido que identifica roles de sistema que no pueden alterarse.';
