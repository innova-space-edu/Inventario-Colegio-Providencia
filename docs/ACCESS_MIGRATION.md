# Migración del inventario Microsoft Access

La base original se conserva como fuente histórica. La migración está diseñada para ser **repetible, trazable, validada antes de escribir y atómica por cada fila transformada**.

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

## Paso 1 — exportar Access en Windows

El exportador usa Microsoft ACE/ADODB y no modifica la base original.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\export-access.ps1 `
  -DatabasePath ".\Colegio Providencia(1).accdb" `
  -OutputDirectory ".\access-export"
```

Se crea un JSON por tabla y `access-export/manifest.json` con SHA-256, conteos y proveedor ACE utilizado.

Si Windows indica que no existe `Microsoft.ACE.OLEDB.16.0` ni `12.0`, se debe instalar Microsoft Access Database Engine de la misma arquitectura que PowerShell/Office.

## Paso 2 — validar el export antes de tocar Supabase

```bash
npm run access:validate -- ./access-export
```

El preflight comprueba manifest, archivos JSON, conteos, identificadores fuente duplicados, códigos de inventario repetidos, números de serie repetidos, tablas sin mapeo y tablas principales ausentes. Los códigos y series repetidos son advertencias porque deben preservarse; errores estructurales bloquean la importación.

Para guardar el informe completo:

```bash
npm run access:validate -- ./access-export --json > access-preflight-report.json
```

`npm run access:import` vuelve a ejecutar automáticamente este preflight. No existe una ruta normal para saltarse la validación por accidente.

## Paso 3 — configurar credenciales solo para la migración

Usar variables de entorno de servidor. **Nunca** copiar la clave secreta a código cliente, variables `NEXT_PUBLIC_*` ni incluirla en Git.

```powershell
$env:SUPABASE_URL="https://TU_PROJECT_REF.supabase.co"
$env:SUPABASE_SECRET_KEY="sb_secret_..."
```

También se admite una `SUPABASE_SERVICE_ROLE_KEY` heredada para una ejecución controlada.

## Paso 4 — importar

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
8. si una ejecución anterior dejó un activo parcial, una nueva ejecución vuelve a completar/reconciliar sus detalles en vez de marcarlo falsamente como terminado;
9. deja tablas no mapeadas en `pending` para revisión manual.

Si un `CODIGO` de Access ya está usado, el nuevo activo se conserva igualmente con `inventory_code = null`; el valor histórico continúa intacto dentro de `legacy_data` y aparecerá en calidad/reconciliación para revisión.

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
