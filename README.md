# Inventario Colegio Providencia

Reconstrucción web del inventario tecnológico originalmente implementado en Microsoft Access (`Colegio Providencia(1).accdb`).

## Stack

- Next.js 16 + React 19 + TypeScript
- Supabase Auth + PostgreSQL + Row Level Security
- Vercel
- GitHub

## Seguridad y acceso

- `admin@colprovidencia.cl` es el administrador raíz protegido.
- El administrador raíz usa el rol `super_admin` y conserva todos los permisos.
- Los demás usuarios usan RBAC mediante `app_roles`, `app_permissions`, `role_permissions` y `user_roles`.
- Roles iniciales: `inventory_manager`, `inventory_operator` y `viewer`; además se pueden crear roles personalizados.
- Todas las tablas del inventario usan RLS y las operaciones críticas validan permisos en PostgreSQL.
- Alta, edición, baja y reactivación son transacciones atómicas.
- No existe registro público en la aplicación.

## Variables de entorno

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

`SUPABASE_SECRET_KEY` es **solo de servidor** y habilita el módulo `/usuarios` para invitar, crear, activar, desactivar y eliminar cuentas mediante Supabase Auth Admin API. Nunca debe usar el prefijo `NEXT_PUBLIC_`, nunca debe enviarse al navegador y nunca debe guardarse con un valor real en Git.

La aplicación sigue usando la publishable key y RLS para las operaciones normales. La clave secreta se limita a las acciones administrativas de Auth ejecutadas en el servidor.

## Principios de migración Access

- El archivo Access original se conserva sin modificaciones.
- Ningún dato histórico se elimina durante la importación.
- Los registros importados conservan `legacy_source`, `legacy_id` y `legacy_data`.
- La columna `FAMILIA` de Access se conserva como `assets.asset_type`.
- Los equipos dados de baja se conservan con historial.
- La importación es repetible y cada fila no transformada permanece en reconciliación.

## Migraciones principales

```text
supabase/migrations/20260819180525_initial_inventory_schema.sql
supabase/migrations/20260819182519_legacy_fidelity_and_idempotent_imports.sql
supabase/migrations/20260819183157_legacy_import_review_workflow.sql
supabase/migrations/20260819183632_single_admin_identity_hardening.sql
supabase/migrations/20260819184842_atomic_asset_state_transitions.sql
supabase/migrations/20260819185236_atomic_asset_create_update.sql
supabase/migrations/20260820012212_add_user_profile_role.sql
supabase/migrations/20260820012308_role_based_access_control.sql
supabase/migrations/20260820012453_protect_root_admin.sql
```

## Administración desde la web

- `/usuarios`: cuentas de Supabase Auth, activación/desactivación y asignación de rol.
- `/roles`: creación de roles personalizados y matriz de permisos.
- `/auditoria`: trazabilidad de cambios del inventario.
- `/configuracion`: estado del sistema.

## Desarrollo

```bash
npm install
npm run dev
```

## Migración del archivo Access

El repositorio incluye `scripts/export-access.ps1`, `scripts/import-access.mjs` y `docs/ACCESS_MIGRATION.md`.

```bash
npm run access:import -- ./access-export
```
