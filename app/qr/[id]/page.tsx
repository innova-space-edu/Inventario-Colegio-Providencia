import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/auth/require-admin";

type Relation<T> = T | T[] | null;
function relationOne<T>(value: Relation<T>): T | null { return Array.isArray(value) ? value[0] ?? null : value; }
function valueOrDash(value: string | number | null | undefined) { return value === null || value === undefined || value === "" ? "—" : String(value); }
export const dynamic = "force-dynamic";

export default async function QrAssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requirePermission("inventory.view");
  const { data: rawAsset } = await supabase.from("assets").select("id,inventory_code,name,asset_type,brand,model,serial_number,responsible_name,observations,is_disposed,family:asset_families(code,name),status:asset_statuses(name),location:locations(name)").eq("id", id).maybeSingle();
  if (!rawAsset) notFound();
  const asset = rawAsset as typeof rawAsset & {
    family: Relation<{ code: string; name: string }>;
    status: Relation<{ name: string }>;
    location: Relation<{ name: string }>;
  };
  const family = relationOne(asset.family); const status = relationOne(asset.status); const location = relationOne(asset.location);

  let computer: {
    screen_size: string | null;
    operating_system: string | null;
    memory: string | null;
    storage: string | null;
    resolution: string | null;
    touch_enabled: boolean | null;
    touch_points: number | null;
  } | null = null;
  if (family?.code === "computer") {
    const { data } = await supabase.from("computer_details").select("screen_size,operating_system,memory,storage,resolution,touch_enabled,touch_points").eq("asset_id", id).maybeSingle();
    computer = data ?? null;
  }

  const rows: Array<[string, string]> = [
    ["Marca", valueOrDash(asset.brand)],
    ["Modelo", valueOrDash(asset.model)],
    ["Número de serie", valueOrDash(asset.serial_number)],
    ["Tamaño", valueOrDash(computer?.screen_size)],
    ["Sistema operativo", valueOrDash(computer?.operating_system)],
    ["RAM", valueOrDash(computer?.memory)],
    ["Almacenamiento", valueOrDash(computer?.storage)],
    ["Resolución", valueOrDash(computer?.resolution)],
    ["Táctil", computer?.touch_enabled === true ? "Sí" : computer?.touch_enabled === false ? "No" : "—"],
    ["Cantidad de puntos táctiles", valueOrDash(computer?.touch_points)],
    ["Responsable", valueOrDash(asset.responsible_name)],
    ["Ubicación", valueOrDash(location?.name)],
    ["Estado", asset.is_disposed ? "Dado de baja" : valueOrDash(status?.name)],
    ["Observaciones", valueOrDash(asset.observations)],
  ];

  return <AppShell>
    <header className="topbar"><div><h1>{asset.inventory_code || asset.name || "Dispositivo"}</h1><p>{asset.asset_type || family?.name || "Activo de inventario"} · ficha QR</p></div><Link className="button button-ghost" href={`/inventario/${id}`}>Ver ficha completa</Link></header>
    <section className="panel"><div className="panel-heading"><div><h2>Información del dispositivo</h2><p className="muted">Esta ficha se obtiene en tiempo real desde el inventario. El QR no necesita cambiar cuando se actualizan los datos.</p></div><span className={`status-pill ${asset.is_disposed ? "status-danger" : ""}`}>{asset.is_disposed ? "Dado de baja" : status?.name || "Sin estado"}</span></div><div className="detail-grid">{rows.map(([label, value]) => <div className={`detail-item ${label === "Observaciones" ? "detail-wide" : ""}`} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>
  </AppShell>;
}
