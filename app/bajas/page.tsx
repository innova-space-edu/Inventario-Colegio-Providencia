import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/auth/require-admin";
import type { InventorySearchParams } from "@/lib/inventory/types";

type Relation<T> = T | T[] | null;
type AssetRow = {
  id: string;
  inventory_code: string | null;
  name: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  quantity: number;
  updated_at: string;
  family: Relation<{ name: string }>;
  location: Relation<{ name: string }>;
};
type DisposalRow = {
  asset_id: string;
  disposal_date: string | null;
  reason: string | null;
  observations: string | null;
  approved_by: string | null;
  created_at: string;
};

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function relationOne<T>(value: Relation<T>): T | null { return Array.isArray(value) ? value[0] ?? null : value; }
function formatDate(value: string) { return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(value)); }

export const dynamic = "force-dynamic";

export default async function DisposalsPage({ searchParams }: { searchParams: Promise<InventorySearchParams> }) {
  const params = await searchParams;
  const q = first(params.q).trim();
  const requestedPage = Number(first(params.page) || "1");
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
  const pageSize = 30;
  const { supabase } = await requirePermission("inventory.view");
  const { data: canExport } = await supabase.rpc("has_permission", { p_permission: "reports.export" });

  let query = supabase
    .from("assets")
    .select("id,inventory_code,name,brand,model,serial_number,quantity,updated_at,family:asset_families(name),location:locations(name)", { count: "exact" })
    .eq("is_disposed", true)
    .order("updated_at", { ascending: false });

  const safeSearch = q.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim();
  if (safeSearch) query = query.or(`inventory_code.ilike.%${safeSearch}%,name.ilike.%${safeSearch}%,brand.ilike.%${safeSearch}%,model.ilike.%${safeSearch}%,serial_number.ilike.%${safeSearch}%`);

  const from = (page - 1) * pageSize;
  const { data, count, error } = await query.range(from, from + pageSize - 1);
  const assets = (data ?? []) as unknown as AssetRow[];
  const assetIds = assets.map((asset) => asset.id);
  let disposals: DisposalRow[] = [];

  if (assetIds.length) {
    const { data: disposalData } = await supabase
      .from("asset_disposals")
      .select("asset_id,disposal_date,reason,observations,approved_by,created_at")
      .in("asset_id", assetIds)
      .order("created_at", { ascending: false });
    disposals = (disposalData ?? []) as DisposalRow[];
  }

  const latestDisposal = new Map<string, DisposalRow>();
  for (const disposal of disposals) if (!latestDisposal.has(disposal.asset_id)) latestDisposal.set(disposal.asset_id, disposal);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const buildPageHref = (nextPage: number) => {
    const queryString = new URLSearchParams();
    if (q) queryString.set("q", q);
    if (nextPage > 1) queryString.set("page", String(nextPage));
    return queryString.toString() ? `/bajas?${queryString}` : "/bajas";
  };

  return <AppShell>
    <header className="topbar"><div><h1>Baja de equipos</h1><p>Consulta de activos retirados sin perder su ficha, motivo, autorización ni trazabilidad histórica.</p></div>{canExport === true ? <Link className="button button-secondary" href="/api/export/assets?scope=disposed">Exportar bajas CSV</Link> : null}</header>
    <section className="stats compact-stats"><article className="stat-card"><span>Total dados de baja</span><strong>{total}</strong></article><article className="stat-card"><span>En esta página</span><strong>{assets.length}</strong></article></section>
    <section className="panel"><form className="filters compact-filters" method="get"><label className="field filter-search"><span>Buscar equipo dado de baja</span><input defaultValue={q} name="q" placeholder="Código, nombre, marca, modelo o serie" /></label><div className="filter-actions"><button className="button button-secondary" type="submit">Buscar</button><Link className="button button-ghost" href="/bajas">Limpiar</Link></div></form></section>
    <section className="panel"><div className="panel-heading"><div><h2>Registros de baja</h2><p className="muted">{total} activo{total === 1 ? "" : "s"} retirado{total === 1 ? "" : "s"}.</p></div><span className="badge">Página {page} de {totalPages}</span></div>{error ? <div className="error-box">No fue posible cargar los registros de baja.</div> : null}{!error && assets.length === 0 ? <div className="empty-state">No existen activos dados de baja con ese criterio.</div> : null}{assets.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Fecha</th><th>Código</th><th>Activo</th><th>Familia</th><th>Ubicación</th><th>Motivo</th><th>Autoriza</th><th /></tr></thead><tbody>{assets.map((asset) => { const family = relationOne(asset.family); const location = relationOne(asset.location); const disposal = latestDisposal.get(asset.id); return <tr key={asset.id}><td>{disposal?.disposal_date ? formatDate(disposal.disposal_date) : "Fecha no registrada"}</td><td><strong>{asset.inventory_code || "—"}</strong></td><td>{asset.name || [asset.brand, asset.model].filter(Boolean).join(" ") || "Sin descripción"}</td><td>{family?.name || "—"}</td><td>{location?.name || "—"}</td><td>{disposal?.reason || "—"}</td><td>{disposal?.approved_by || "—"}</td><td><Link className="table-link" href={`/inventario/${asset.id}`}>Ver ficha</Link></td></tr>; })}</tbody></table></div> : null}{totalPages > 1 ? <nav className="pagination"><Link className={`button button-ghost ${page <= 1 ? "disabled" : ""}`} href={buildPageHref(Math.max(1, page - 1))}>Anterior</Link><span>{page} / {totalPages}</span><Link className={`button button-ghost ${page >= totalPages ? "disabled" : ""}`} href={buildPageHref(Math.min(totalPages, page + 1))}>Siguiente</Link></nav> : null}</section>
  </AppShell>;
}
