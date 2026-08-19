# Migración del inventario Microsoft Access

La base original se conserva como fuente histórica. La migración está diseñada para ser **repetible, trazable y sin pérdida silenciosa de filas**.

## Estructura recuperada del archivo original

Los formularios y tablas detectados incluyen:

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

## Paso 2 — configurar credenciales solo para la migración

Usar variables de entorno de servidor. **Nunca** copiar la clave secreta a Vercel como `NEXT_PUBLIC_*` ni incluirla en Git.

PowerShell:

```powershell
$env:SUPABASE_URL="https://TU_PROJECT_REF.supabase.co"
$env:SUPABASE_SECRET_KEY="sb_secret_..."
```

También se admite una `SUPABASE_SERVICE_ROLE_KEY` heredada para una ejecución controlada.

## Paso 3 — importar

```bash
npm run access:import -- ./access-export
```

La importación:

1. crea `migration_runs`;
2. conserva cada fila en `legacy_imports` antes de transformarla;
3. usa `legacy_source + legacy_id` para no duplicar una fila al repetir el proceso;
4. crea/reutiliza ubicaciones;
5. inserta el activo y su `legacy_data` completo;
6. carga detalles especializados de computadores, proyectores y televisores;
7. registra `asset_history`;
8. marca la fila legado como `migrated` o `error`;
9. deja tablas no mapeadas en `pending` para revisión, sin descartarlas.

Si un `CODIGO` de Access está duplicado y choca con el código único moderno, el activo se conserva igualmente: se importa con `inventory_code = null` y el código original continúa dentro de `legacy_data`.

## Reconciliación obligatoria

Al terminar, revisar `/importaciones` y comparar:

- filas de fuente;
- importadas;
- pendientes de revisión;
- errores.

La migración no se considera cerrada mientras exista una diferencia no explicada entre el archivo fuente y los registros preservados en Supabase.
