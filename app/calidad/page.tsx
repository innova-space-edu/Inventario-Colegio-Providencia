import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/auth/require-admin";

type Relation<T> = T | T[] | null;
type QualityAsset = {
  id: string;
  inventory_code: string | null;
  name: string | null;
  asset_type: string | null;
  serial_number: string | null;
  status_id: string | null;
  location_id: string | null;
  area: string | null;
  family: Relation<{ name: string }>;
};
type IssueCode = "missing_code" | "duplicate_code" | "missing_description" | "missing_location" | "missing_status" | "duplicate_serial";
type QualityIssue = { asset: QualityAsset; codes: IssueCode[]; labels: string[] };

const issueOptions: Array<{ code: "all" | IssueCode; label: string }> = [
  { code: "all", label: "Todos los problemas" },
  { code: "missing_code", label: "Sin código de inventario" },
  { code: "duplicate_code", label: "Código de inventario repetido" },
  { code: "missing_description", label: "Sin descripción/tipo" },
  { code: "missing_location", label: "Sin ubicación" },
  { code: "missing_status", label: "Sin estado" },
  { code: "duplicate_serial", label: "Serie duplicada" },
];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
function relationOne<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}
function normalized(value: string | null) {
  return value?.trim().toUpperCase() || "";
}

export const dynamic = "force-dynamic";

export default async function DataQualityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const requestedIssue = first(params.problema);
  const issueFilter = issueOptions.some((item) => item.code === requestedIssue) ? requestedIssue : "all";
  const { supabase } = await requirePermission("quality.view");
  const [{ data: canManage }, { data: canViewImports }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission: "quality.manage" }),
    supabase.rpc("has_permission", { p_permission: "imports.view" }),
  ]);

  const assets: QualityAsset[] = [];
  const chunkSize = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("assets")
      .select("id,inventory_code,name,asset_type,serial_number,status_id,location_id,area,family:asset_families(name)")
      .eq("is_disposed", false)
      .order("created_at", { ascending: true })
      .range(offset, offset + chunkSize - 1);
    if (error) throw new Error(`No fue posible analizar la calidad del inventario: ${error.message}`);
    const chunk = (data ?? []) as unknown as QualityAsset[];
    assets.push(...chunk);
    if (chunk.length < chunkSize) break;
    offset += chunkSize;
  }

  const codeOwners = new Map<string, string[]>();
  const serialOwners = new Map<string, string[]>();
  for (const asset of assets) {
    const code = normalized(asset.inventory_code);
    if (code) codeOwners.set(code, [...(codeOwners.get(code) ?? []), asset.id]);
    const serial = normalized(asset.serial_number);
    if (serial) serialOwners.set(serial, [...(serialOwners.get(serial) ?? []), asset.id]);
  }
  const duplicateCodes = new Set([...codeOwners.entries()].filter(([, ids]) => ids.length > 1).map(([code]) => code));
  const duplicateSerials = new Set([...serialOwners.entries()].filter(([, ids]) => ids.length > 1).map(([serial]) => serial));

  const issues: QualityIssue[] = assets.map((asset) => {
    const codes: IssueCode[] = [];
    const labels: string[] = [];
    const inventoryCode = normalized(asset.inventory_code);
    const serial = normalized(asset.serial_number);

    if (!inventoryCode) { codes.push("missing_code"); labels.push("Sin código de inventario"); }
    if (inventoryCode && duplicateCodes.has(inventoryCode)) { codes.push("duplicate_code"); labels.push("Código de inventario repetido"); }
    if (!asset.name?.trim() && !asset.asset_type?.trim()) { codes.push("missing_description"); labels.push("Sin nombre ni tipo/subfamilia"); }
    if (!asset.location_id && !asset.area?.trim()) { codes.push("missing_location"); labels.push("Sin ubicación ni área"); }
    if (!asset.status_id) { codes.push("missing_status"); labels.push("Sin estado"); }
    if (serial && duplicateSerials.has(serial)) { codes.push("duplicate_serial"); labels.push("Número de serie duplicado"); }
    return { asset, codes, labels };
  }).filter((item) => item.codes.length > 0);

  const [{ count: legacyPending }, { count: legacyErrors }] = canViewImports === true
    ? await Promise.all([
      supabase.from("legacy_imports").select("id", { count: "exact", head: true }).eq("migration_status", "pending"),
      supabase.from("legacy_imports").select("id", { count: "exact", head: true }).eq("migration_status", "error"),
    ])
    : [{ count: 0 }, { count: 0 }];

  const filteredIssues = issueFilter === "all" ? issues : issues.filter((item) => item.codes.includes(issueFilter as IssueCode));
  const cleanAssets = assets.length - issues.length;
  const score = assets.length === 0 ? 100 : Math.round((cleanAssets / assets.length) * 100);
  const displayRows = filteredIssues.slice(0, 300);
  const counts = new Map<IssueCode, number>();
  for (const issue of issues) for (const code of issue.codes) counts.set(code, (counts.get(code) ?? 0) + 1);

  return (
    <AppShell>
      <header className="topbar"><div><h1>Calidad de datos</h1><p>Detecta inconsistencias sin borrar ni ocultar valores históricos provenientes de Microsoft Access.</p></div><span className="badge">Calidad {score}%</span></header>
      <section className="stats"><article className="stat-card"><span>Activos vigentes</span><strong>{assets.length}</strong></article><article className="stat-card"><span>Sin alertas</span><strong>{cleanAssets}</strong></article><article className="stat-card"><span>Requieren revisión</span><strong>{issues.length}</strong></article><article className="stat-card"><span>Filas Access por resolver</span><strong>{(legacyPending ?? 0) + (legacyErrors ?? 0)}</strong></article></section>
      <section className="panel"><div className="panel-heading"><div><h2>Controles automáticos</h2><p className="muted">Los códigos repetidos se conservan porque pueden existir en el inventario histórico; aquí se señalan para revisión en lugar de perder el dato.</p></div>{canViewImports === true ? <Link className="button button-ghost" href="/importaciones/revision">Reconciliar Access</Link> : null}</div><div className="rule-grid">{issueOptions.filter((item): item is { code: IssueCode; label: string } => item.code !== "all").map((item) => <Link className="management-card" href={`/calidad?problema=${item.code}`} key={item.code}><strong>{item.label}</strong><span>{counts.get(item.code) ?? 0} registro(s)</span></Link>)}</div></section>
      <section className="panel"><form className="filters compact-filters" method="get"><label className="field"><span>Problema</span><select defaultValue={issueFilter} name="problema">{issueOptions.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><div className="filter-actions"><button className="button button-secondary" type="submit">Aplicar</button><Link className="button button-ghost" href="/calidad">Limpiar</Link></div></form></section>
      <section className="panel"><div className="panel-heading"><div><h2>Registros para revisar</h2><p className="muted">{filteredIssues.length} resultado(s). {canManage === true ? "Puedes abrir la ficha y decidir si el valor histórico debe corregirse o conservarse." : "Vista de solo lectura."}</p></div></div>{!displayRows.length ? <div className="empty-state">No se detectaron problemas para este filtro.</div> : null}{displayRows.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Código</th><th>Activo</th><th>Familia</th><th>Serie</th><th>Alertas detectadas</th>{canManage === true ? <th /> : null}</tr></thead><tbody>{displayRows.map(({ asset, labels }) => { const family = relationOne(asset.family); return <tr key={asset.id}><td><strong>{asset.inventory_code || "—"}</strong></td><td>{asset.name || asset.asset_type || "Sin descripción"}</td><td>{family?.name || "—"}</td><td>{asset.serial_number || "—"}</td><td>{labels.join(" · ")}</td>{canManage === true ? <td><Link className="table-link" href={`/inventario/${asset.id}/editar`}>Revisar</Link></td> : null}</tr>; })}</tbody></table></div> : null}</section>
    </AppShell>
  );
}
