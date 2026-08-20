import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/auth/require-admin";

type Relation<T> = T | T[] | null;
function relationOne<T>(value: Relation<T>): T | null { return Array.isArray(value) ? value[0] ?? null : value; }
const CATEGORY_LABELS: Record<string, string> = { classroom: "Salas de clases", office: "Oficinas", dependency: "Dependencias", legacy: "Ubicación heredada" };
export const dynamic = "force-dynamic";

export default async function LocationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requirePermission("locations.view");
  const [{ data: location }, { data: rawAssets }] = await Promise.all([
    supabase.from("locations").select("id,name,area,description,active,category,selectable").eq("id", id).maybeSingle(),
    supabase.from("assets").select("id,inventory_code,name,asset_type,brand,model,serial_number,responsible_name,quantity,is_disposed,family:asset_families(name),status:asset_statuses(name)").eq("location_id", id).order("is_disposed").order("asset_type").order("inventory_code"),
  ]);
  if (!location) notFound();
  const assets = (rawAssets ?? []) as Array<{
    id: string; inventory_code: string | null; name: string | null; asset_type: string | null; brand: string | null; model: string | null; serial_number: string | null; responsible_name: string | null; quantity: number; is_disposed: boolean;
    family: Relation<{ name: string }>; status: Relation<{ name: string }>;
  }>;
  const activeAssets = assets.filter((asset) => !asset.is_disposed);
  const familyCounts = new Map<string, number>();
  for (const asset of activeAssets) { const family = relationOne(asset.family)?.name ?? "Sin familia"; familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1); }

  return <AppShell>
    <header className="topbar"><div><h1>{location.name}</h1><p>{CATEGORY_LABELS[location.category] || "Ubicación"}{location.area ? ` · ${location.area}` : ""}</p></div><Link className="button button-ghost" href={`/ubicaciones?tipo=${location.category === "legacy" ? "classroom" : location.category}`}>Volver a ubicaciones</Link></header>
    <section className="panel"><div className="panel-heading"><div><h2>Resumen de la ubicación</h2><p className="muted">Inventario actualmente asignado a {location.name}.</p></div><span className="badge">{activeAssets.length} activo(s)</span></div><div className="detail-grid"><div className="detail-item"><span>Activos vigentes</span><strong>{activeAssets.length}</strong></div><div className="detail-item"><span>Total histórico</span><strong>{assets.length}</strong></div><div className="detail-item"><span>Tipo</span><strong>{CATEGORY_LABELS[location.category] || location.category}</strong></div><div className="detail-item"><span>Estado de ubicación</span><strong>{location.active ? "Activa" : "Inactiva"}</strong></div>{[...familyCounts.entries()].map(([family, count]) => <div className="detail-item" key={family}><span>{family}</span><strong>{count}</strong></div>)}</div>{location.description ? <p className="muted">{location.description}</p> : null}</section>
    <section className="panel"><div className="panel-heading"><div><h2>Equipos y activos</h2><p className="muted">Selecciona un registro para abrir su ficha y código QR.</p></div></div>{!assets.length ? <div className="empty-state">No hay activos asignados a esta ubicación.</div> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Código</th><th>Tipo</th><th>Activo</th><th>Marca / modelo</th><th>Serie</th><th>Responsable</th><th>Estado</th><th /></tr></thead><tbody>{assets.map((asset) => { const status = relationOne(asset.status); return <tr key={asset.id}><td><strong>{asset.inventory_code || "—"}</strong></td><td>{asset.asset_type || "—"}</td><td>{asset.name || "Sin descripción"}</td><td>{[asset.brand, asset.model].filter(Boolean).join(" · ") || "—"}</td><td>{asset.serial_number || "—"}</td><td>{asset.responsible_name || "—"}</td><td><span className={`status-pill ${asset.is_disposed ? "status-danger" : ""}`}>{asset.is_disposed ? "Dado de baja" : status?.name || "Sin estado"}</span></td><td><Link className="table-link" href={`/inventario/${asset.id}`}>Ver</Link></td></tr>; })}</tbody></table></div>}</section>
  </AppShell>;
}
