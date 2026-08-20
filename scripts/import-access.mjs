import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createSourceIdentityResolver } from "./legacy-identity.mjs";

const exportDirectory = path.resolve(process.argv[2] || "access-export");
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

function runPreflight() {
  console.log("Validando export de Access antes de importar…");
  const result = spawnSync(process.execPath, [path.join(scriptDirectory, "validate-access-export.mjs"), exportDirectory], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error("La validación estructural falló. Supabase no fue modificado.");
    process.exit(result.status || 2);
  }
}

runPreflight();

const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !secretKey) {
  console.error("Faltan SUPABASE_URL y SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY). No uses una clave secreta en NEXT_PUBLIC_*.");
  process.exit(1);
}

const apiBase = `${supabaseUrl}/rest/v1`;
const baseHeaders = { apikey: secretKey, "Content-Type": "application/json" };
if (secretKey.split(".").length === 3) baseHeaders.Authorization = `Bearer ${secretKey}`;

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

function numberOrOne(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
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

async function request(resource, { method = "GET", body, prefer } = {}) {
  const response = await fetch(`${apiBase}/${resource}`, {
    method,
    headers: { ...baseHeaders, ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }

  if (!response.ok) {
    const error = new Error(`Supabase ${response.status}: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function queryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined) search.set(key, String(value));
  return search.toString();
}

async function select(table, params) { return request(`${table}?${queryString(params)}`); }
async function insert(table, body, { representation = true } = {}) {
  return request(table, { method: "POST", body, prefer: representation ? "return=representation" : "return=minimal" });
}
async function patch(table, filters, body) {
  return request(`${table}?${queryString(filters)}`, { method: "PATCH", body, prefer: "return=minimal" });
}
async function rpc(name, body) { return request(`rpc/${name}`, { method: "POST", body }); }

const tableMap = {
  COMPUTADORAS: { family: "computer", fallbackName: "Computador" },
  AUDIO: { family: "audio", fallbackName: "Equipo de audio" },
  MUEBLES: { family: "furniture", fallbackName: "Mueble" },
  IMPRESORAS: { family: "printer", fallbackName: "Impresora" },
  PROYECTORES: { family: "projector", fallbackName: "Proyector" },
  VARIOS: { family: "misc", fallbackName: "Varios" },
  ACCESORIOS: { family: "accessory", fallbackName: "Accesorio" },
  TELEVISORES: { family: "television", fallbackName: "Televisor" },
};

const manifest = JSON.parse(await fs.readFile(path.join(exportDirectory, "manifest.json"), "utf8"));
const existingLocations = await select("locations", { select: "id,name,legacy_value" });
const locationsByName = new Map(existingLocations.map((item) => [canonical(item.name), item]));

async function ensureLocation(rawLocation) {
  const name = clean(rawLocation);
  if (!name) return null;
  const key = canonical(name);
  const existing = locationsByName.get(key);
  if (existing) return existing.id;

  try {
    const created = await insert("locations", [{ name, legacy_value: name, active: true }]);
    const row = created[0];
    locationsByName.set(key, row);
    return row.id;
  } catch (error) {
    if (error.status !== 409) throw error;
    const rows = await select("locations", { select: "id,name,legacy_value", name: `eq.${name}`, limit: 1 });
    if (!rows[0]) throw error;
    locationsByName.set(key, rows[0]);
    return rows[0].id;
  }
}

async function findLegacyStage(table, sourceId) {
  const rows = await select("legacy_imports", {
    select: "id,migration_status,migrated_asset_id,payload",
    source_table: `eq.${table}`,
    source_id: `eq.${sourceId}`,
    limit: 1,
  });
  return rows[0] || null;
}

async function ensureLegacyStage(table, sourceId, row) {
  const existing = await findLegacyStage(table, sourceId);
  if (existing) {
    await patch("legacy_imports", { id: `eq.${existing.id}` }, { payload: row });
    return { ...existing, payload: row };
  }
  const created = await insert("legacy_imports", [{ source_table: table, source_id: sourceId, payload: row, migration_status: "pending" }]);
  return created[0];
}

function buildAsset(row, familyConfig) {
  const accessFamily = clean(pick(row, "FAMILIA"));
  const article = clean(pick(row, "ARTICULO"));
  const explicitName = clean(pick(row, "NOMBRE"));
  let name = explicitName || accessFamily || familyConfig.fallbackName;
  let assetType = accessFamily;

  if (familyConfig.family === "accessory") {
    name = article || name;
    assetType = article || assetType;
  } else if (familyConfig.family === "misc") {
    name = explicitName || article || name;
    assetType = article || assetType;
  } else if (familyConfig.family === "television") {
    assetType = accessFamily || "TELEVISOR";
  }

  return {
    inventory_code: clean(pick(row, "CODIGO", "INVENTARIO")),
    name,
    asset_type: assetType,
    brand: clean(pick(row, "MARCA")),
    model: clean(pick(row, "MODELO")),
    serial_number: clean(pick(row, "SERIE")),
    quantity: numberOrOne(pick(row, "CANTIDAD")),
    area: clean(pick(row, "AREA")),
    observations: clean(pick(row, "OBSERVACIONES")),
  };
}

function buildDetails(row, familyCode) {
  if (familyCode === "computer") return {
    memory: clean(pick(row, "MEMORIA")),
    storage: clean(pick(row, "DISCO")),
    screen: clean(pick(row, "PANTALLA")),
    keyboard: clean(pick(row, "TECLADO")),
    battery: clean(pick(row, "BATERIA")),
    charger: clean(pick(row, "CARGADOR")),
  };
  if (familyCode === "projector") return {
    lumens: clean(pick(row, "LUMENES")),
    hdmi: clean(pick(row, "HDMI")),
    vga: clean(pick(row, "VGA")),
  };
  if (familyCode === "television") return { size: clean(pick(row, "TAMANO", "TAMAÑO", "TAMA")) };
  return {};
}

const runRows = await insert("migration_runs", [{
  source_file: manifest.source_file || "Access export",
  source_sha256: manifest.source_sha256 || null,
  status: "running",
  notes: "Importación automatizada después de preflight estructural obligatorio.",
}]);
const runId = runRows[0].id;

let sourceRows = 0;
let importedRows = 0;
let reconciledRows = 0;
let rejectedRows = 0;
let pendingReviewRows = 0;
let ignoredRows = 0;
let generatedIdentityRows = 0;

try {
  for (const tableEntry of manifest.tables || []) {
    const sourceTable = String(tableEntry.name || "").trim();
    const rows = JSON.parse(await fs.readFile(path.join(exportDirectory, tableEntry.file), "utf8"));
    const mapping = tableMap[canonical(sourceTable)];
    const resolveSourceIdentity = createSourceIdentityResolver();
    console.log(`\n${sourceTable}: ${rows.length} filas`);

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      sourceRows++;
      const identity = resolveSourceIdentity(row);
      const sourceId = identity.sourceId;
      if (identity.strategy === "content_hash") generatedIdentityRows++;
      const stage = await ensureLegacyStage(sourceTable, sourceId, row);

      if (stage.migration_status === "ignored") {
        ignoredRows++;
        continue;
      }

      if (!mapping) {
        pendingReviewRows++;
        if (stage.migration_status === "error") {
          await patch("legacy_imports", { id: `eq.${stage.id}` }, { migration_status: "pending", error_message: null });
        }
        continue;
      }

      try {
        const locationId = await ensureLocation(pick(row, "UBICACION", "UBICACI"));
        const result = await rpc("import_legacy_asset_atomic", {
          p_stage_id: stage.id,
          p_family_code: mapping.family,
          p_location_id: locationId,
          p_asset: buildAsset(row, mapping),
          p_details: buildDetails(row, mapping.family),
        });

        if (result?.created === true) importedRows++;
        else reconciledRows++;
      } catch (error) {
        rejectedRows++;
        const message = error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000);
        await patch("legacy_imports", { id: `eq.${stage.id}` }, { migration_status: "error", error_message: message });
        console.error(`  ERROR ${sourceTable}/${sourceId}: ${message}`);
      }
    }
  }

  await patch("migration_runs", { id: `eq.${runId}` }, {
    status: "completed",
    finished_at: new Date().toISOString(),
    source_rows: sourceRows,
    imported_rows: importedRows,
    rejected_rows: rejectedRows,
    notes: `Importación terminada. Nuevos=${importedRows}; reconciliados=${reconciledRows}; pendientes=${pendingReviewRows}; ignorados=${ignoredRows}; errores=${rejectedRows}; identidades_hash=${generatedIdentityRows}.`,
  });
} catch (error) {
  await patch("migration_runs", { id: `eq.${runId}` }, {
    status: "failed",
    finished_at: new Date().toISOString(),
    source_rows: sourceRows,
    imported_rows: importedRows,
    rejected_rows: rejectedRows,
    notes: error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000),
  });
  throw error;
}

console.log("\nResumen de importación");
console.log(`Fuente: ${sourceRows}`);
console.log(`Nuevos activos importados: ${importedRows}`);
console.log(`Activos reconciliados/reparados: ${reconciledRows}`);
console.log(`Filas para revisión: ${pendingReviewRows}`);
console.log(`Filas ignoradas por decisión administrativa: ${ignoredRows}`);
console.log(`Filas sin ID explícito con identidad estable por hash: ${generatedIdentityRows}`);
console.log(`Errores: ${rejectedRows}`);
console.log(`Migration run: ${runId}`);

if (rejectedRows > 0) process.exitCode = 2;
