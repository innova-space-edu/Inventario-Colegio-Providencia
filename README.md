# Inventario Colegio Providencia

Reconstrucción web del inventario tecnológico originalmente implementado en Microsoft Access (`Colegio Providencia(1).accdb`).

## Stack

- Next.js 16 + React 19 + TypeScript
- Supabase Auth + PostgreSQL + Row Level Security
- Vercel
- GitHub

## Principios de migración

- El archivo Access original se conserva sin modificaciones.
- Ningún dato histórico se elimina durante la importación.
- Los registros importados conservan `legacy_source`, `legacy_id` y `legacy_data`.
- La antigua columna `FAMILIA` de Access se conserva como `assets.asset_type`; no se confunde con las ocho familias tecnológicas modernas.
- Los equipos dados de baja se conservan con historial.
- La importación es repetible mediante identidad legado e historial de ejecuciones.
- Las filas no transformadas permanecen visibles en el panel de reconciliación y solo pueden ignorarse con una nota administrativa.

## Seguridad

- No existe registro público dentro de la aplicación.
- Las cuentas se crean exclusivamente desde Supabase Authentication.
- Todas las tablas del inventario usan RLS.
- La autorización administrativa se valida contra `public.profiles`.
- No se debe exponer una `service_role` o secret key en variables `NEXT_PUBLIC_*`.

## Variables de entorno de la aplicación

Crear `.env.local` a partir de `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

En Vercel deben configurarse las mismas dos variables para Production, Preview y Development según corresponda.

## Base de datos

Migraciones principales:

```text
supabase/migrations/20260819180525_initial_inventory_schema.sql
supabase/migrations/20260819182519_legacy_fidelity_and_idempotent_imports.sql
supabase/migrations/20260819183157_legacy_import_review_workflow.sql
```

## Primer administrador

1. Crear el usuario manualmente en Supabase → Authentication → Users.
2. Copiar el UUID del usuario.
3. Ejecutar en Supabase SQL Editor:

```sql
insert into public.profiles (id, email, role, active)
values ('UUID_DEL_USUARIO', 'correo@ejemplo.cl', 'admin', true);
```

La aplicación no implementa `signUp`.

## Desarrollo

```bash
npm install
npm run dev
```

## Migración del archivo Access

El repositorio incluye `scripts/export-access.ps1`, `scripts/import-access.mjs` y `docs/ACCESS_MIGRATION.md`. Después de exportar el `.accdb` en Windows:

```bash
npm run access:import -- ./access-export
```

El módulo `/importaciones/revision` permite revisar filas `pending`, `error`, `ignored` y `migrated`, consultar el payload original y documentar explícitamente las exclusiones.
