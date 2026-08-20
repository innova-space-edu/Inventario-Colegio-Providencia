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
| BAJA / BAJA DE EQUIPOS | flujo de baja | Reconciliación manual segura |

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

## Identidad estable de cada fila

Cuando una tabla Access trae un campo `ID`, ese valor se usa como identidad fuente. Algunas tablas históricas no tienen un ID visible; en ellas **no se usa el número de fila**, porque el orden de `SELECT *` puede cambiar entre exportaciones. El pipeline calcula un SHA-256 determinista del contenido completo de la fila y agrega un contador de ocurrencia para conservar incluso dos filas totalmente idénticas.

Así, repetir la exportación o cambiar el orden de las filas no crea duplicados artificiales en `legacy_imports`. El preflight informa cuántas filas usan ID explícito y cuántas usan identidad estable por hash.

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

El preflight comprueba manifest, archivos JSON, conteos, identidades fuente, códigos de inventario repetidos, números de serie repetidos, tablas sin mapeo y tablas principales ausentes. Cuando el archivo Access original sigue disponible en la misma ruta, también vuelve a calcular su SHA-256 para comprobar que no cambió después de la exportación. Los códigos y series repetidos son advertencias porque deben preservarse; errores estructurales bloquean la importación.

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
4. usa ID explícito o identidad estable por hash para evitar duplicados al repetir una exportación;
5. respeta filas marcadas administrativamente como `ignored`;
6. crea o reutiliza ubicaciones;
7. importa **activo + detalle especializado + historial + estado de la fila legado dentro de una única transacción PostgreSQL**;
8. usa `legacy_source + legacy_id` para que repetir el proceso no duplique activos;
9. si una ejecución anterior dejó un activo parcial, una nueva ejecución vuelve a completar/reconciliar sus detalles;
10. conserva íntegramente los códigos de inventario repetidos y los marca en `/calidad` para revisión;
11. deja tablas no mapeadas en `pending` para revisión manual;
12. las filas de tablas `BAJA` se vinculan manualmente desde `/importaciones/bajas` para evitar dar de baja el activo equivocado.

Los códigos repetidos **no se convierten en `null` ni se descartan**. El sistema conserva el valor original en `assets.inventory_code` y `legacy_data`; `/calidad` muestra la alerta para que el administrador decida si el duplicado es histórico válido o un dato a corregir.

## Reconciliación obligatoria

Al terminar, revisar `/importaciones`, `/importaciones/revision`, `/importaciones/bajas` y `/calidad` y comparar:

- filas de fuente;
- filas preservadas en `legacy_imports`;
- activos nuevos;
- activos reconciliados/reparados;
- bajas históricas reconciliadas;
- pendientes de revisión;
- filas ignoradas con justificación;
- errores;
- códigos y series duplicados detectados por calidad de datos.

La migración no se considera cerrada mientras exista una diferencia no explicada entre el archivo fuente y los registros preservados en Supabase.
