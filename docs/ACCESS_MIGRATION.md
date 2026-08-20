# Migración del inventario Microsoft Access

La base original se conserva como fuente histórica. La migración está diseñada para ser **repetible, trazable, validada antes de escribir y atómica por cada fila transformada**.

## Opción recomendada — asistente seguro en Windows

Con Node.js 22 instalado y el repositorio actualizado, el flujo completo puede ejecutarse con un único script. Por defecto **solo exporta y valida; no escribe en Supabase**:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\migrate-access.ps1 `
  -DatabasePath ".\Colegio Providencia(1).accdb"
```

El comando instala dependencias con `npm ci`, exporta Access con Microsoft ACE, ejecuta el preflight y guarda `access-export/access-preflight-report.json`.

Solo después de revisar que la validación sea correcta se habilita la carga real. La clave secreta debe vivir únicamente en la sesión local:

```powershell
$env:SUPABASE_URL="https://TU_PROJECT_REF.supabase.co"
$env:SUPABASE_SECRET_KEY="sb_secret_..."

powershell -ExecutionPolicy Bypass -File .\scripts\migrate-access.ps1 `
  -DatabasePath ".\Colegio Providencia(1).accdb" `
  -Import
```

Nunca escribas la Secret Key dentro del script, Git, Vercel como `NEXT_PUBLIC_*`, capturas ni parámetros del comando.

## Estructura recuperada del archivo original

| Tabla Access | Formulario | Mapeo web |
| --- | --- | --- |
| COMPUTADORAS | FORCOMPUTADORAS | Computadores |
| AUDIO | FORAUDIO | Audio |
| MUEBLES | FORMUEBLES | Muebles |
| IMPRESORAS | FORIMPRESORAS | Impresoras |
| PROYECTORES | FORPROYECTORES | Proyectores |
| VARIOS | FORVARIOS | Varios |
| ACCESORIOS | FORACCESORIOS | Accesorios |
| TELEVISORES | FORTELEVISORES | Televisores |

Campos recuperados del diseño de Access:

- `COMPUTADORAS`: `CODIGO`, `FAMILIA`, `MARCA`, `MODELO`, `MEMORIA`, `DISCO`, `PANTALLA`, `TECLADO`, `BATERIA`, `CARGADOR`, `OBSERVACIONES`, `SERIE`, `UBICACION`.
- `AUDIO`: `CODIGO`, `FAMILIA`, `SERIE`, `MARCA`, `MODELO`, `UBICACION`, `OBSERVACIONES`.
- `MUEBLES`: `CODIGO`, `FAMILIA`, `MARCA`, `MODELO`, `OBSERVACIONES`, `UBICACION`.
- `IMPRESORAS`: `CODIGO`, `FAMILIA`, `MARCA`, `MODELO`, `SERIE`, `UBICACION`, `OBSERVACIONES`.
- `PROYECTORES`: `INVENTARIO/CODIGO`, `FAMILIA`, `MARCA`, `MODELO`, `SERIE`, `LUMENES`, `HDMI`, `UBICACION`, `OBSERVACIONES`.
- `VARIOS`: `ARTICULO`, `NOMBRE`, `AREA`, `UBICACION`.
- `ACCESORIOS`: `ARTICULO`, `MARCA`, `SERIE`, `UBICACION`, `OBSERVACIONES`.
- `TELEVISORES`: `MARCA`, `SERIE`, `TAMAÑO`, `UBICACION`, `OBSERVACIONES`.

`FAMILIA` de Access se guarda en `assets.asset_type`. Las ocho familias tecnológicas principales se guardan separadamente en `asset_families`.

## Flujo manual equivalente

### 1. Exportar Access

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\export-access.ps1 `
  -DatabasePath ".\Colegio Providencia(1).accdb" `
  -OutputDirectory ".\access-export"
```

Se crea un JSON por tabla y `access-export/manifest.json` con SHA-256, conteos y proveedor ACE utilizado. Si Windows indica que no existe `Microsoft.ACE.OLEDB.16.0` ni `12.0`, se debe instalar Microsoft Access Database Engine de la misma arquitectura que PowerShell/Office.

### 2. Validar antes de tocar Supabase

```bash
npm run access:validate -- ./access-export
```

El preflight comprueba manifest, archivos JSON, conteos, identificadores fuente duplicados, códigos de inventario repetidos, números de serie repetidos, tablas sin mapeo y tablas principales ausentes. Los códigos y series repetidos son advertencias porque deben preservarse; errores estructurales bloquean la importación.

Para guardar el informe completo:

```bash
npm run access:validate -- ./access-export --json > access-preflight-report.json
```

`npm run access:import` vuelve a ejecutar automáticamente este preflight.

### 3. Importar

```bash
npm run access:import -- ./access-export
```

La importación:

1. ejecuta nuevamente el preflight;
2. crea una ejecución en `migration_runs`;
3. conserva cada fila en `legacy_imports` antes de transformarla;
4. respeta filas marcadas administrativamente como `ignored`;
5. crea o reutiliza ubicaciones;
6. importa **activo + detalle especializado + historial + estado de la fila legado dentro de una única transacción PostgreSQL**;
7. usa `legacy_source + legacy_id` para que repetir el proceso no duplique activos;
8. si una ejecución anterior dejó un activo parcial, una nueva ejecución vuelve a completar/reconciliar sus detalles;
9. deja tablas no mapeadas en `pending` para revisión manual.

Si un `CODIGO` de Access ya está usado, el nuevo activo se conserva con `inventory_code = null`; el valor histórico continúa intacto en `legacy_data` y aparecerá en calidad/reconciliación.

## Reconciliación obligatoria

Al terminar, revisar `/importaciones`, `/importaciones/revision` y `/calidad` y comparar:

- filas de fuente;
- filas preservadas en `legacy_imports`;
- activos nuevos;
- activos reconciliados/reparados;
- pendientes de revisión;
- filas ignoradas con justificación;
- errores;
- duplicados y faltantes detectados por calidad de datos.

La migración no se considera cerrada mientras exista una diferencia no explicada entre el archivo fuente y los registros preservados en Supabase.
