# Inventario Colegio Providencia

Reconstrucción web del inventario tecnológico originalmente implementado en Microsoft Access (`Colegio Providencia.accdb`).

## Stack

- Next.js 16 + React 19 + TypeScript
- Supabase Auth + PostgreSQL + Row Level Security
- Vercel
- GitHub

## Seguridad y acceso

- `admin@colprovidencia.cl` es el administrador raíz protegido.
- El administrador raíz usa `super_admin` y conserva todos los permisos.
- Los demás usuarios usan RBAC mediante `app_roles`, `app_permissions`, `role_permissions` y `user_roles`.
- Se pueden asignar los mismos roles a múltiples usuarios y crear roles personalizados.
- Todas las tablas del inventario usan RLS y las operaciones críticas validan permisos en PostgreSQL.
- Alta, edición, baja, reactivación e importación legado usan operaciones transaccionales.
- No existe registro público en la aplicación.

## Variables de entorno

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

`SUPABASE_SECRET_KEY` es **solo de servidor**. Habilita Auth Admin y la migración controlada; nunca debe usar `NEXT_PUBLIC_`, enviarse al navegador ni guardarse con un valor real en Git.

## Inventario Access migrado

La fuente `Colegio Providencia.accdb` tiene SHA-256:

```text
4602f8ee7d9c78352a7f2dcb259db1bc7e019870d312193fb0dd3c1c4d6e8d05
```

La primera migración real preservó **235/235 filas**. El esquema soporta inventario vigente, bajas históricas, reconciliación manual cuando existe un candidato exacto, conservación íntegra de `legacy_data` e importaciones idempotentes.

## Migraciones principales

Las migraciones viven en `supabase/migrations/`. Entre las últimas capas se incluyen RBAC, auditoría administrativa, importación atómica, conservación de duplicados, reconciliación por ejecución y bajas históricas automáticas (`20260820062253_auto_import_historical_disposals.sql`).

## Administración desde la web

- `/usuarios`: cuentas de Supabase Auth, activación/desactivación y roles.
- `/roles`: roles personalizados y matriz de permisos.
- `/inventario`: inventario general.
- `/bajas`: activos retirados e históricos.
- `/calidad`: controles de consistencia.
- `/informes`: informes imprimibles/PDF y CSV.
- `/auditoria`: trazabilidad técnica y administrativa.
- `/importaciones`: estado de migración Access.
- `/importaciones/bajas`: reconciliación manual únicamente cuando una baja histórica coincide con un activo ya existente.
- `/configuracion`: estado del sistema.

## Desarrollo

```bash
npm ci
npm run dev
```

## Migración del archivo Access

El flujo completo está documentado en `docs/ACCESS_MIGRATION.md`.

```bash
npm run access:validate -- ./access-export
npm run access:import -- ./access-export
```
