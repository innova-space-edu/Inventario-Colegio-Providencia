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
- Los equipos dados de baja se conservan con historial.

## Seguridad

- No existe registro público dentro de la aplicación.
- Las cuentas se crean exclusivamente desde Supabase Authentication.
- Todas las tablas del inventario usan RLS.
- La autorización administrativa se valida contra `public.profiles`.
- No se debe exponer una `service_role` o secret key en variables `NEXT_PUBLIC_*`.

## Variables de entorno

Crear `.env.local` a partir de `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

En Vercel deben configurarse las mismas dos variables para Production, Preview y Development según corresponda.

## Base de datos

La primera migración está en:

```text
supabase/migrations/20260819154500_initial_inventory_schema.sql
```

Crea el núcleo de inventario, familias, estados, ubicaciones, bajas, historial, auditoría y tablas de conservación de datos legado. También habilita RLS y define permisos explícitos para `authenticated`.

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

## Próximas fases

1. Aplicar y verificar la migración en Supabase.
2. Crear el administrador.
3. Configurar variables de entorno en Vercel.
4. Verificar login y dashboard.
5. Extraer todas las tablas y registros del `.accdb`.
6. Ejecutar importación de prueba y reconciliar conteos.
7. Implementar inventario general y formularios por familia.
8. Implementar bajas, informes y auditoría completa.
