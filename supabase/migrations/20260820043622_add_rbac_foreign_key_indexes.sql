-- Índices de soporte para claves foráneas del sistema RBAC.
-- Recomendados por Supabase Performance Advisor.

create index if not exists app_roles_created_by_idx
  on public.app_roles(created_by);

create index if not exists role_permissions_permission_code_idx
  on public.role_permissions(permission_code);

create index if not exists user_roles_assigned_by_idx
  on public.user_roles(assigned_by);
