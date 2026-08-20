import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createSourceIdentityResolver } from "./legacy-identity.mjs";

const exportDirectory = path.resolve(process.argv[2] || "access-export");
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

function runPreflight() {
  console.log("Validando export de Access antes de importar…");
  const result = spawnSync(process.execPath, [path.join(scriptDirectory, "validate-access-export.mjs"), exportDirectory], { stdio: "inherit" });
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
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function exactKey(value) {
  const normalized = clean(value);
  return normalized ? normalized.toUpperCase() : null;
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
function parseJsonText(text) {
  return JSON.parse(String(text).replace(/^\uFEFF/, ""));
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
const disposalTables = new Set(["BAJADEEQUIPOS", "BAJA", "REGISTROBAJA"]);

const manifest = parseJsonText(await fs.readFile(path.join(exportDirectory, "manifest.json"), "utf8"));
const existingLocations = await select("locations", { select: "id,name,legacy_value" });
const locationsByName = new Map(existingLocations.map((item) => [canonical(item.name), item]));

const existingAssets = await select("assets", {
  select: "id,inventory_code,serial_number,legacy_source,legacy_id,is_disposed",
});
const assetById = new Map();
const assetsByInventory = new Map();
const assetsBySerial = new Map();

function addToAssetIndex(map, key, assetId) {
  if (!key || !assetId) return;
  const values = map.get(key) ?? new Set();
  values.add(assetId);
  map.set(key, values);
}
function indexAsset(asset) {
  if (!asset?.id) return;
  assetById.set(asset.id, asset);
  addToAssetIndex(assetsByInventory, exactKey(asset.inventory_code), asset.id);
  addToAssetIndex(assetsBySerial, exactKey(asset.serial_number), asset.id);
}
for (const asset of existingAssets) indexAsset(asset);

function findDisposalCandidates(row, sourceTable, sourceId) {
  const ids = new Set();
  const inventory = exactKey(pick(row, "N° INVENTARIO", "Nº INVENTARIO", "INVENTARIO", "CODIGO"));
  const serial = exactKey(pick(row, "N° SERIE", "Nº SERIE", "SERIE"));
  for (const id of assetsByInventory.get(inventory) ?? []) ids.add(id);
  for (const id of assetsBySerial.get(serial) ?? []) ids.add(id);
  return [...ids].filter((id) => {
    const asset = assetById.get(id);
    return !(asset?.legacy_source === sourceTable && String(asset?.legacy_id ?? "") === String(sourceId));
  });
}

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
    select: "id,migration_status,migrated_asset_id,payload,first_seen_run_id,last_seen_run_id",
    source_table: `eq.${table}`,
    source_id: `eq.${sourceId}`,
    limit: 1,
  });
  return rows[0] || null;
}

async function ensureLegacyStage(table, sourceId, row, currentRunId) {
  const existing = await findLegacyStage(table, sourceId);
  if (existing) {
    await patch("legacy_imports", { id: `eq.${existing.id}` }, { payload: row, last_seen_run_id: currentRunId });
    return { ...existing, payload: row, last_seen_run_id: currentRunId };
  }
  const created = await insert("legacy_imports", [{
    source_table: table,
    source_id: sourceId,
    payload: row,
    migration_status: "pending",
    first_seen_run_id: currentRunId,
    last_seen_run_id: currentRunId,
  }]);
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
    memory: clean(pick(row, "MEMORIA")), storage: clean(pick(row, "DISCO")), screen: clean(pick(row, "PANTALLA")),
    keyboard: clean(pick(row, "TECLADO")), battery: clean(pick(row, "BATERIA")), charger: clean(pick(row, "CARGADOR")),
  };
  if (familyCode === "projector") return {
    lumens: clean(pick(row, "LUMENES")), hdmi: clean(pick(row, "HDMI")), vga: clean(pick(row, "VGA")),
  };
  if (familyCode === "television") return { size: clean(pick(row, "TAMANO", "TAMAÑO", "TAMA")) };
  return {};
}

function parseDisposalDate(value) {
  const raw = clean(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function buildHistoricalDisposal(row) {
  const observations = clean(pick(row, "OBSERVACIONES"));
  const brand = clean(pick(row, "MARCA"));
  const model = clean(pick(row, "MODELO"));
  const text = canonical(observations);
  const hasComputerPart = ["COMPUTADOR", "DISCO", "LECTOR", "FUENTE"].some((field) => clean(pick(row, field)));

  let familyCode = "misc";
  let assetType = "EQUIPO DADO DE BAJA";
  if (text.includes("MICROFONO")) {
    familyCode = "audio";
    assetType = text.includes("INALAMBR") ? "MICROFONO INALAMBRICO" : "MICROFONO";
  } else if (text.includes("MONITOR") || canonical(brand) === "PCCHIPS" || hasComputerPart) {
    familyCode = "computer";
    assetType = text.includes("MONITOR") ? "MONITOR" : "EQUIPO / COMPONENTE COMPUTACIONAL";
  }

  return {
    familyCode,
    asset: {
      inventory_code: clean(pick(row, "N° INVENTARIO", "Nº INVENTARIO", "INVENTARIO", "CODIGO")),
      name: observations || [brand, model].filter(Boolean).join(" ") || "Equipo histórico dado de baja",
      asset_type: assetType,
      brand,
      model,
      serial_number: clean(pick(row, "N° SERIE", "Nº SERIE", "SERIE")),
      quantity: 1,
      area: null,
      observations,
    },
    reason: "Registro histórico de baja migrado desde Microsoft Access",
    observations,
    approvedBy: null,
    disposalDate: parseDisposalDate(pick(row, "REGISTRO BAJA", "FECHA BAJA", "FECHA")),
  };
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
let historicalDisposalRows = 0;
let manualDisposalRows = 0;
let rejectedRows = 0;
let pendingReviewRows = 0;
let ignoredRows = 0;
let generatedIdentityRows = 0;

function tableRank(tableEntry) {
  const key = canonical(tableEntry?.name);
  if (tableMap[key]) return 0;
  if (disposalTables.has(key)) return 1;
  return 2;
}

try {
  const orderedTables = [...(manifest.tables || [])].sort((a, b) => tableRank(a) - tableRank(b));

  for (const tableEntry of orderedTables) {
    const sourceTable = String(tableEntry.name || "").trim();
    const tableKey = canonical(sourceTable);
    const rows = parseJsonText(await fs.readFile(path.join(exportDirectory, tableEntry.file), "utf8"));
    const mapping = tableMap[tableKey];
    const isDisposalTable = disposalTables.has(tableKey);
    const resolveSourceIdentity = createSourceIdentityResolver();
    console.log(`\n${sourceTable}: ${rows.length} filas`);

    for (const row of rows) {
      sourceRows++;
      const identity = resolveSourceIdentity(row);
      const sourceId = identity.sourceId;
      if (identity.strategy === "content_hash") generatedIdentityRows++;
      const stage = await ensureLegacyStage(sourceTable, sourceId, row, runId);

      if (stage.migration_status === "ignored") {
        ignoredRows++;
        continue;
      }

      if (isDisposalTable) {
        const historical = buildHistoricalDisposal(row);
        try {
          const ownMigratedAsset = stage.migration_status === "migrated" && stage.migrated_asset_id;
          const candidateIds = ownMigratedAsset ? [] : findDisposalCandidates(row, sourceTable, sourceId);

          if (candidateIds.length > 0) {
            pendingReviewRows++;
            manualDisposalRows++;
            if (stage.migration_status === "error") {
              await patch("legacy_imports", { id: `eq.${stage.id}` }, { migration_status: "pending", error_message: null });
            }
            console.warn(`  BAJA ${sourceTable}/${sourceId}: ${candidateIds.length} candidato(s) exacto(s); queda pendiente para /importaciones/bajas.`);
            continue;
          }

          const result = await rpc("import_legacy_disposed_asset_atomic", {
            p_stage_id: stage.id,
            p_family_code: historical.familyCode,
            p_asset: historical.asset,
            p_reason: historical.reason,
            p_observations: historical.observations,
            p_approved_by: historical.approvedBy,
            p_disposal_date: historical.disposalDate,
          });

          historicalDisposalRows++;
          if (result?.asset_created === true) importedRows++;
          else reconciledRows++;

          if (result?.asset_id) {
            indexAsset({
              id: result.asset_id,
              inventory_code: historical.asset.inventory_code,
              serial_number: historical.asset.serial_number,
              legacy_source: sourceTable,
              legacy_id: sourceId,
              is_disposed: true,
            });
          }
        } catch (error) {
          rejectedRows++;
          const message = error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000);
          await patch("legacy_imports", { id: `eq.${stage.id}` }, { migration_status: "error", error_message: message });
          console.error(`  ERROR BAJA ${sourceTable}/${sourceId}: ${message}`);
        }
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
        const assetPayload = buildAsset(row, mapping);
        const result = await rpc("import_legacy_asset_atomic", {
          p_stage_id: stage.id,
          p_family_code: mapping.family,
          p_location_id: locationId,
          p_asset: assetPayload,
          p_details: buildDetails(row, mapping.family),
        });
        if (result?.created === true) importedRows++;
        else reconciledRows++;

        if (result?.asset_id) {
          indexAsset({
            id: result.asset_id,
            inventory_code: assetPayload.inventory_code,
            serial_number: assetPayload.serial_number,
            legacy_source: sourceTable,
            legacy_id: sourceId,
            is_disposed: false,
          });
        }
      } catch (error) {
        rejectedRows++;
        const message = error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000);
        await patch("legacy_imports", { id: `eq.${stage.id}` }, { migration_status: "error", error_message: message });
        console.error(`  ERROR ${sourceTable}/${sourceId}: ${message}`);
      }
    }
  }

  const preservedRows = Number(await rpc("count_legacy_rows_for_run", { p_run_id: runId }));
  const preservationOk = preservedRows === sourceRows;
  const fullyReconciled = preservationOk && rejectedRows === 0 && pendingReviewRows === 0;

  await patch("migration_runs", { id: `eq.${runId}` }, {
    status: fullyReconciled ? "completed" : "completed_with_review",
    finished_at: new Date().toISOString(),
    source_rows: sourceRows,
    imported_rows: importedRows,
    rejected_rows: rejectedRows,
    notes: `Importación terminada. preservadas=${preservedRows}/${sourceRows}; nuevos=${importedRows}; reconciliados=${reconciledRows}; bajas_historicas=${historicalDisposalRows}; bajas_con_candidato=${manualDisposalRows}; pendientes=${pendingReviewRows}; ignorados=${ignoredRows}; errores=${rejectedRows}; identidades_hash=${generatedIdentityRows}.`,
  });

  if (!preservationOk) {
    throw new Error(`Reconciliación incompleta: la fuente contiene ${sourceRows} filas pero ${preservedRows} quedaron vinculadas a esta ejecución.`);
  }
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
console.log(`Bajas históricas importadas/reconciliadas: ${historicalDisposalRows}`);
console.log(`Bajas con candidato que requieren revisión manual: ${manualDisposalRows}`);
console.log(`Filas para revisión: ${pendingReviewRows}`);
console.log(`Filas ignoradas por decisión administrativa: ${ignoredRows}`);
console.log(`Filas sin ID explícito con identidad estable por hash: ${generatedIdentityRows}`);
console.log(`Errores: ${rejectedRows}`);
console.log(`Migration run: ${runId}`);

if (rejectedRows > 0) process.exitCode = 2;
