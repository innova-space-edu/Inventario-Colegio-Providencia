import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { disposeAsset, reactivateAsset } from "@/app/inventario/actions";
import { requirePermission } from "@/lib/auth/require-admin";

type Relation<T> = T | T[] | null;
function relationOne<T>(value: Relation<T>): T | null { return Array.isArray(value) ? value[0] ?? null : value; }
function valueOrDash(value: string | number | null | undefined) { return value === null || value === undefined || value === "" ? "—" : String(value); }
function formatDate(value: string) { return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function formatDateOnly(value: string) { return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(value)); }
export const dynamic = "force-dynamic";

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requirePermission("inventory.view");
  const [{ data: canEdit }, { data: canDispose }, { data: canReactivate }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission: "inventory.edit" }),
    supabase.rpc("has_permission", { p_permission: "inventory.dispose" }),
    supabase.rpc("has_permission", { p_permission: "inventory.reactivate" }),
  ]);
  const { data: rawAsset } = await supabase.from("assets").select("*,family:asset_families(code,name),status:asset_statuses(code,name),location:locations(name,area,category)").eq("id", id).maybeSingle();
  if (!rawAsset) notFound();
  const asset = rawAsset as typeof rawAsset & {
    family: Relation<{ code: string; name: string }>;
    status: Relation<{ code: string; name: string }>;
    location: Relation<{ name: string; area: string | null; category: string }>;
  };
  const family = relationOne(asset.family); const status = relationOne(asset.status); const location = relationOne(asset.location);
  let detailRows: Array<[string, string | null]> = [];
  if (family?.code === "computer") {
    const { data } = await supabase.from("computer_details").select("memory,storage,screen,keyboard,battery,charger,screen_size,operating_system,resolution,touch_enabled,touch_points").eq("asset_id", id).maybeSingle();
    if (data) detailRows = [
      ["Tamaño", data.screen_size],
      ["Sistema operativo", data.operating_system],
      ["Memoria RAM", data.memory],
      ["Almacenamiento", data.storage],
      ["Resolución", data.resolution],
      ["Táctil", data.touch_enabled === true ? "Sí" : data.touch_enabled === false ? "No" : null],
      ["Cantidad de puntos táctiles", data.touch_points === null || data.touch_points === undefined ? null : String(data.touch_points)],
      ["Pantalla / dato heredado", data.screen],
      ["Teclado", data.keyboard],
      ["Batería", data.battery],
      ["Cargador", data.charger],
    ];
  } else if (family?.code === "projector") {
    const { data } = await supabase.from("projector_details").select("lumens,hdmi,vga").eq("asset_id", id).maybeSingle(); if (data) detailRows = [["Lúmenes", data.lumens], ["HDMI", data.hdmi], ["VGA", data.vga]];
  } else if (family?.code === "television") {
    const { data } = await supabase.from("television_details").select("size").eq("asset_id", id).maybeSingle(); if (data) detailRows = [["Tamaño", data.size]];
  }
  const [{ data: history }, { data: disposals }] = await Promise.all([
    supabase.from("asset_history").select("id,event_type,description,created_at").eq("asset_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("asset_disposals").select("id,disposal_date,reason,observations,approved_by,created_at").eq("asset_id", id).order("created_at", { ascending: false }).limit(10),
  ]);

  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = host?.startsWith("localhost") ? "http" : forwardedProto || "https";
  const qrTarget = host ? `${protocol}://${host}/qr/${id}` : `/qr/${id}`;
  const qrImage = `https://quickchart.io/qr?size=220&margin=1&text=${encodeURIComponent(qrTarget)}`;

  return <AppShell>
    <header className="topbar"><div><h1>{asset.inventory_code || asset.name || "Activo"}</h1><p>{family?.name || "Sin familia"} · actualizado {formatDate(asset.updated_at)}</p></div><div className="header-actions"><Link className="button button-ghost" href="/inventario">Volver</Link>{canEdit === true ? <Link className="button button-primary" href={`/inventario/${id}/editar`}>Editar</Link> : null}</div></header>
    <section className="panel"><div className="panel-heading"><div><h2>Ficha del activo</h2><p className="muted">Información general y trazabilidad actual.</p></div><span className={`status-pill ${asset.is_disposed ? "status-danger" : ""}`}>{asset.is_disposed ? "Dado de baja" : status?.name || "Sin estado"}</span></div><div className="detail-grid"><div className="detail-item"><span>Código</span><strong>{valueOrDash(asset.inventory_code)}</strong></div><div className="detail-item"><span>Nombre</span><strong>{valueOrDash(asset.name)}</strong></div><div className="detail-item"><span>Tipo / subfamilia</span><strong>{valueOrDash(asset.asset_type)}</strong></div><div className="detail-item"><span>Familia tecnológica</span><strong>{valueOrDash(family?.name)}</strong></div><div className="detail-item"><span>Marca</span><strong>{valueOrDash(asset.brand)}</strong></div><div className="detail-item"><span>Modelo</span><strong>{valueOrDash(asset.model)}</strong></div><div className="detail-item"><span>Serie</span><strong>{valueOrDash(asset.serial_number)}</strong></div><div className="detail-item"><span>Cantidad</span><strong>{asset.quantity}</strong></div><div className="detail-item"><span>Ubicación</span><strong>{valueOrDash(location?.name)}</strong></div><div className="detail-item"><span>Responsable</span><strong>{valueOrDash(asset.responsible_name)}</strong></div><div className="detail-item"><span>Área</span><strong>{valueOrDash(asset.area || location?.area)}</strong></div><div className="detail-item detail-wide"><span>Observaciones</span><strong>{valueOrDash(asset.observations)}</strong></div></div></section>
    {detailRows.length ? <section className="panel"><h2>Especificaciones de {family?.name.toLowerCase()}</h2><div className="detail-grid">{detailRows.map(([label, value]) => <div className="detail-item" key={label}><span>{label}</span><strong>{valueOrDash(value)}</strong></div>)}</div></section> : null}
    <section className="panel"><div className="panel-heading"><div><h2>Código QR</h2><p className="muted">El QR identifica este activo por su ID interno. Si cambian marca, responsable o ubicación, no es necesario reemplazar la etiqueta.</p></div></div><div style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "center" }}><img alt={`Código QR de ${asset.inventory_code || asset.name || "activo"}`} height={220} src={qrImage} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 10 }} width={220} /><div><p className="muted">Al escanearlo, un usuario autorizado verá la ficha QR actualizada del dispositivo.</p><Link className="button button-secondary" href={`/qr/${id}`}>Abrir ficha QR</Link></div></div></section>
    <section className="panel"><div className="panel-heading"><div><h2>Historial</h2><p className="muted">Eventos funcionales registrados para este activo.</p></div></div>{history?.length ? <div className="timeline">{history.map((event) => <article key={event.id}><div><strong>{event.event_type}</strong><span>{event.description || "Sin descripción"}</span></div><time>{formatDate(event.created_at)}</time></article>)}</div> : <div className="empty-state">Todavía no hay eventos de historial.</div>}</section>
    {disposals?.length ? <section className="panel"><h2>Antecedentes de baja</h2><div className="timeline">{disposals.map((item) => <article key={item.id}><div><strong>{item.disposal_date ? formatDateOnly(item.disposal_date) : "Fecha histórica no registrada"}</strong><span>{item.reason || "Sin motivo"}{item.approved_by ? ` · Autoriza: ${item.approved_by}` : ""}</span></div><time>Registrado {formatDate(item.created_at)}</time></article>)}</div></section> : null}
    {!asset.is_disposed && canDispose === true ? <section className="panel danger-panel"><div className="panel-heading"><div><h2>Dar de baja</h2><p className="muted">La baja no elimina el activo: conserva ficha, historial y evidencia de la operación.</p></div></div><form action={disposeAsset} className="form-grid"><input name="asset_id" type="hidden" value={id} /><label className="field field-wide"><span>Motivo de la baja</span><input name="reason" placeholder="Ej. equipo irreparable, obsolescencia, pérdida" required /></label><label className="field"><span>Autorizado por</span><input defaultValue={profile.email} name="approved_by" /></label><label className="field field-wide"><span>Observaciones</span><textarea name="disposal_observations" rows={3} /></label><div className="form-actions field-wide"><button className="button button-danger" type="submit">Confirmar baja</button></div></form></section> : null}
    {asset.is_disposed && canReactivate === true ? <section className="panel"><div className="panel-heading"><div><h2>Reactivar activo</h2><p className="muted">El antecedente de baja se conserva y la reactivación queda registrada en historial.</p></div></div><form action={reactivateAsset} className="form-grid"><input name="asset_id" type="hidden" value={id} /><label className="field field-wide"><span>Motivo de reactivación</span><input name="reactivation_reason" placeholder="Explica por qué el activo vuelve a estado operativo" required /></label><div className="form-actions field-wide"><button className="button button-secondary" type="submit">Reactivar y conservar historial</button></div></form></section> : null}
  </AppShell>;
}
