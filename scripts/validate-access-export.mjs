import fs from "node:fs/promises";
import path from "node:path";

const exportDirectory = path.resolve(process.argv[2] || "access-export");
const jsonOutput = process.argv.includes("--json");

const EXPECTED_TABLES = new Set([
  "COMPUTADORAS",
  "AUDIO",
  "MUEBLES",
  "IMPRESORAS",
  "PROYECTORES",
  "VARIOS",
  "ACCESORIOS",
  "TELEVISORES",
]);

function canonical(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function clean(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized === "" ? null : normalized;
}

function pick(row, ...aliases) {
  const entries = Object.entries(row ?? {}).map(([key, value]) => [canonical(key), value]);
  const wanted = aliases.map(canonical);
  for (const alias of wanted) {
    const exact = entries.find(([key]) => key === alias);
    if (exact) return exact[1];
  }
  for (const alias of wanted.filter((item) => item.length >= 5)) {
    const prefix = entries.find(([key]) => key.startsWith(alias) || alias.startsWith(key));
    if (prefix) return prefix[1];
  }
  return null;
}

function sourceIdentity(row, index) {
  return clean(pick(row, "ID", "Id")) || `row-${index + 1}`;
}

function addOccurrence(map, key, occurrence) {
  if (!key) return;
  const normalized = String(key).trim().toUpperCase();
  if (!normalized) return;
  const values = map.get(normalized) ?? [];
  values.push(occurrence);
  map.set(normalized, values);
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function duplicates(map) {
  return [...map.entries()]
    .filter(([, occurrences]) => occurrences.length > 1)
    .map(([value, occurrences]) => ({ value, occurrences }));
}

async function main() {
  const manifestPath = path.join(exportDirectory, "manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch (error) {
    console.error(`No fue posible leer ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }

  if (!Array.isArray(manifest.tables)) {
    console.error("manifest.json no contiene un arreglo tables válido.");
    process.exit(2);
  }

  const report = {
    source_file: manifest.source_file ?? null,
    source_sha256: manifest.source_sha256 ?? null,
    exported_at: manifest.exported_at ?? null,
    tables: [],
    totals: { manifest_rows: 0, parsed_rows: 0, tables_ok: 0, tables_with_errors: 0 },
    warnings: [],
    errors: [],
    duplicate_inventory_codes: [],
    duplicate_serial_numbers: [],
    unmapped_tables: [],
    missing_expected_tables: [],
  };

  const inventoryCodes = new Map();
  const serialNumbers = new Map();
  const presentExpected = new Set();
  const manifestNames = new Map();

  for (const table of manifest.tables) {
    const tableName = String(table?.name ?? "").trim();
    const tableKey = canonical(tableName);
    const declaredRows = Number(table?.row_count ?? 0);
    const fileName = table?.file ? String(table.file) : null;
    const entry = {
      name: tableName,
      file: fileName,
      declared_rows: Number.isFinite(declaredRows) ? declaredRows : null,
      parsed_rows: null,
      duplicate_source_ids: [],
      status: "ok",
      error: table?.error ?? null,
    };

    addOccurrence(manifestNames, tableKey, tableName);
    if (EXPECTED_TABLES.has(tableKey)) presentExpected.add(tableKey);
    else report.unmapped_tables.push(tableName || "(sin nombre)");

    report.totals.manifest_rows += Number.isFinite(declaredRows) ? declaredRows : 0;

    if (table?.error) {
      entry.status = "error";
      report.errors.push(`La exportación reportó error en ${tableName}: ${table.error}`);
      report.totals.tables_with_errors++;
      report.tables.push(entry);
      continue;
    }

    if (!fileName) {
      entry.status = "error";
      report.errors.push(`La tabla ${tableName} no tiene archivo JSON asociado.`);
      report.totals.tables_with_errors++;
      report.tables.push(entry);
      continue;
    }

    const filePath = path.join(exportDirectory, fileName);
    if (!(await fileExists(filePath))) {
      entry.status = "error";
      report.errors.push(`Falta el archivo ${fileName} declarado para ${tableName}.`);
      report.totals.tables_with_errors++;
      report.tables.push(entry);
      continue;
    }

    let rows;
    try {
      rows = JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch (error) {
      entry.status = "error";
      report.errors.push(`JSON inválido en ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
      report.totals.tables_with_errors++;
      report.tables.push(entry);
      continue;
    }

    if (!Array.isArray(rows)) {
      entry.status = "error";
      report.errors.push(`${fileName} debe contener un arreglo de filas.`);
      report.totals.tables_with_errors++;
      report.tables.push(entry);
      continue;
    }

    entry.parsed_rows = rows.length;
    report.totals.parsed_rows += rows.length;

    if (Number.isFinite(declaredRows) && declaredRows !== rows.length) {
      entry.status = "error";
      report.errors.push(`${tableName}: manifest declara ${declaredRows} filas pero el JSON contiene ${rows.length}.`);
    }

    const sourceIds = new Map();
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        entry.status = "error";
        report.errors.push(`${tableName}: fila ${index + 1} no es un objeto JSON.`);
        continue;
      }

      const sourceId = sourceIdentity(row, index);
      addOccurrence(sourceIds, sourceId, index + 1);

      if (EXPECTED_TABLES.has(tableKey)) {
        const inventoryCode = clean(pick(row, "CODIGO", "INVENTARIO"));
        const serial = clean(pick(row, "SERIE"));
        addOccurrence(inventoryCodes, inventoryCode, { table: tableName, source_id: sourceId, row: index + 1 });
        addOccurrence(serialNumbers, serial, { table: tableName, source_id: sourceId, row: index + 1 });
      }
    }

    entry.duplicate_source_ids = duplicates(sourceIds);
    if (entry.duplicate_source_ids.length) {
      entry.status = "error";
      report.errors.push(`${tableName}: existen ${entry.duplicate_source_ids.length} identificadores fuente duplicados.`);
    }

    if (entry.status === "ok") report.totals.tables_ok++;
    else report.totals.tables_with_errors++;
    report.tables.push(entry);
  }

  const duplicateManifestNames = duplicates(manifestNames);
  if (duplicateManifestNames.length) {
    report.errors.push(`El manifest contiene ${duplicateManifestNames.length} nombre(s) de tabla duplicado(s).`);
  }

  report.duplicate_inventory_codes = duplicates(inventoryCodes);
  report.duplicate_serial_numbers = duplicates(serialNumbers);
  report.missing_expected_tables = [...EXPECTED_TABLES].filter((name) => !presentExpected.has(name));

  if (report.duplicate_inventory_codes.length) {
    report.warnings.push(`${report.duplicate_inventory_codes.length} código(s) de inventario se repiten. El importador los preservará, pero deben revisarse después.`);
  }
  if (report.duplicate_serial_numbers.length) {
    report.warnings.push(`${report.duplicate_serial_numbers.length} número(s) de serie se repiten entre las ocho tablas principales.`);
  }
  if (report.unmapped_tables.length) {
    report.warnings.push(`${report.unmapped_tables.length} tabla(s) no tienen transformación automática y quedarán preservadas para reconciliación manual.`);
  }
  if (report.missing_expected_tables.length) {
    report.warnings.push(`No aparecen en el export: ${report.missing_expected_tables.join(", ")}.`);
  }

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("\nPreflight Microsoft Access → Inventario Colegio Providencia\n");
    console.log(`Archivo fuente: ${report.source_file || "—"}`);
    console.log(`SHA-256: ${report.source_sha256 || "—"}`);
    console.log(`Tablas declaradas: ${manifest.tables.length}`);
    console.log(`Filas manifest: ${report.totals.manifest_rows}`);
    console.log(`Filas JSON: ${report.totals.parsed_rows}`);
    console.log(`Tablas OK: ${report.totals.tables_ok}`);
    console.log(`Tablas con error: ${report.totals.tables_with_errors}`);
    console.log(`Códigos repetidos: ${report.duplicate_inventory_codes.length}`);
    console.log(`Series repetidas: ${report.duplicate_serial_numbers.length}`);
    console.log(`Tablas sin mapeo automático: ${report.unmapped_tables.length}`);

    if (report.warnings.length) {
      console.log("\nADVERTENCIAS");
      for (const warning of report.warnings) console.log(`- ${warning}`);
    }
    if (report.errors.length) {
      console.log("\nERRORES BLOQUEANTES");
      for (const error of report.errors) console.log(`- ${error}`);
    }

    console.log(report.errors.length ? "\nRESULTADO: NO IMPORTAR todavía." : "\nRESULTADO: export estructuralmente válido para continuar con la importación.");
  }

  if (report.errors.length) process.exitCode = 2;
}

await main();
