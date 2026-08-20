# Migración del inventario Microsoft Access

La base original se conserva como fuente histórica. La migración es **repetible, trazable, validada antes de escribir y atómica por cada fila transformada**.

## Flujo recomendado en Windows

Por defecto el asistente solo exporta y valida; no escribe en Supabase:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\migrate-access.ps1 `
  -DatabasePath ".\Colegio Providencia.accdb"
```

Después de revisar el preflight, la importación real usa credenciales únicamente en la sesión local:

```powershell
$env:SUPABASE_URL="https://TU_PROJECT_REF.supabase.co"
$env:SUPABASE_SECRET_KEY="sb_secret_..."

powershell -ExecutionPolicy Bypass -File .\scripts\migrate-access.ps1 `
  -DatabasePath ".\Colegio Providencia.accdb" `
  -Import -SkipInstall
```

Nunca guardes la Secret Key en Git, capturas, parámetros públicos ni variables `NEXT_PUBLIC_*`.

## Tablas recuperadas y tratamiento

| Tabla Access | Tratamiento |
| --- | --- |
| COMPUTADORAS | Activos `computer` + detalles especializados |
| AUDIO | Activos `audio` |
| MUEBLES | Activos `furniture` |
| IMPRESORAS | Activos `printer` |
| PROYECTORES | Activos `projector` + detalles especializados |
| VARIOS | Activos `misc` |
| ACCESORIOS | Activos `accessory` |
| TELEVISORES | Activos `television` + detalles especializados |
| BAJA / BAJA DE EQUIPOS | Baja histórica automática si no coincide con un activo vigente; si existe candidato exacto, queda pendiente para revisión manual |

`FAMILIA` de Access se guarda en `assets.asset_type`; las familias tecnológicas modernas viven separadas en `asset_families`.

## Seguridad de las bajas históricas

El pipeline procesa primero las ocho tablas principales y después las tablas `BAJA`. Antes de crear un activo histórico dado de baja compara **código de inventario y número de serie exactos** contra los activos ya importados:

- **Sin coincidencia exacta:** crea un activo histórico con estado `disposed`, registra `asset_disposals`, historial y `legacy_imports` en una única transacción.
- **Con una o más coincidencias:** no modifica ningún activo automáticamente; la fila queda `pending` y se resuelve desde `/importaciones/bajas`.
- Si Access no trae fecha de baja, se conserva como **fecha desconocida**; el sistema no inventa la fecha actual.

Las familias de una baja sin coincidencia se infieren de forma conservadora: `MICROFONO*` → Audio, `MONITOR`/componentes computacionales → Computadores y cualquier caso sin evidencia suficiente → Varios. El payload original siempre queda intacto en `legacy_data`.

## Identidad estable de cada fila

Cuando Access trae `ID`, se usa ese valor. Si no existe ID visible, se calcula un SHA-256 determinista del contenido completo de la fila y un contador de ocurrencia. Así cambiar el orden del `SELECT *` no crea duplicados artificiales y dos filas idénticas siguen conservándose por separado.

## Preflight

```bash
npm run access:validate -- ./access-export
```

Comprueba manifest, JSON, conteos, SHA-256 de la fuente, identidades, códigos/series repetidos, tablas principales ausentes y filas BAJA con candidatos exactos. Los errores estructurales bloquean la importación; duplicados y candidatos de baja son advertencias que se preservan para revisión.

## Importación

```bash
npm run access:import -- ./access-export
```

La importación:

1. vuelve a ejecutar el preflight;
2. crea `migration_runs`;
3. preserva todas las filas en `legacy_imports`;
4. procesa primero el inventario vigente y después las bajas;
5. crea/reutiliza ubicaciones;
6. importa activo + detalles + historial mediante RPC transaccionales;
7. usa `legacy_source + legacy_id` para ser idempotente;
8. conserva códigos repetidos en lugar de descartarlos;
9. importa automáticamente bajas históricas sin candidato;
10. deja solo bajas con candidato exacto y tablas desconocidas para revisión manual;
11. finaliza como `completed` únicamente si fuente, preservación, errores y pendientes están completamente conciliados; de lo contrario usa `completed_with_review`.

## Reconciliación final

Revisar `/importaciones`, `/importaciones/revision`, `/importaciones/bajas`, `/calidad` y `/bajas`.

La corrida se considera cerrada cuando:

- `source_rows` coincide con las filas preservadas;
- no existen `legacy_imports` en `error`;
- cualquier `pending` tiene una causa explícita;
- los activos vigentes y bajas históricas explican todas las filas de la fuente;
- los duplicados históricos siguen preservados y visibles para control de calidad.
