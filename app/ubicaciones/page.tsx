import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { createLocation, deleteLocation, updateLocation } from "@/app/ubicaciones/actions";
import { requirePermission } from "@/lib/auth/require-admin";

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
const CATEGORY_LABELS: Record<string, string> = { classroom: "Salas de clases", office: "Oficinas", dependency: "Dependencias", legacy: "Heredadas" };
const CATEGORY_ORDER = ["classroom", "office", "dependency"] as const;
export const dynamic = "force-dynamic";

function errorMessage(error: string) {
  if (error === "in_use") return "No se puede eliminar esa ubicación porque todavía tiene activos asociados. Mueve primero todos sus equipos a otra ubicación.";
  if (error === "delete") return "No fue posible eliminar la ubicación.";
  if (error === "delete_check") return "No fue posible comprobar si la ubicación tiene activos asociados.";
  if (error === "not_found") return "La ubicación indicada ya no existe.";
  if (error) return "No fue posible completar la operación. Revisa el nombre y evita duplicados.";
  return "";
}

export default async function LocationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const state = await searchParams; const error = first(state.error); const requestedType = first(state.tipo);
  const selectedType = CATEGORY_ORDER.includes(requestedType as (typeof CATEGORY_ORDER)[number]) ? requestedType : "classroom";
  const { supabase } = await requirePermission("locations.view");
  const [{ data: canManage }, { data: locationData }, { data: assetData }] = await Promise.all([
    supabase.rpc("has_permission", { p_permission: "locations.manage" }),
    supabase.from("locations").select("id,name,area,description,active,legacy_value,category,display_order,selectable,updated_at").order("category").order("display_order").order("name"),
    supabase.from("assets").select("id,location_id").not("location_id", "is", null),
  ]);
  const locations = locationData ?? [];
  const assetCounts = new Map<string, number>();
  for (const asset of assetData ?? []) if (asset.location_id) assetCounts.set(asset.location_id, (assetCounts.get(asset.location_id) ?? 0) + 1);
  const visibleLocations = locations.filter((location) => location.active && location.selectable && location.category === selectedType);
  const legacyLocations = locations.filter((location) => location.category === "legacy" && (assetCounts.get(location.id) ?? 0) > 0);
  const categoryCounts = new Map(CATEGORY_ORDER.map((category) => [category, locations.filter((location) => location.active && location.selectable && location.category === category).length]));
  const message = errorMessage(error);

  return <AppShell>
    <header className="topbar"><div><h1>Ubicaciones</h1><p>Explora y administra el inventario por salas de clases, oficinas y dependencias oficiales.</p></div><span className="badge">{locations.filter((location) => location.active && location.selectable).length} oficiales</span></header>

    <section className="panel panel-flush"><div className="header-actions" style={{ padding: "16px", flexWrap: "wrap" }}>{CATEGORY_ORDER.map((category) => <Link className={`button ${selectedType === category ? "button-primary" : "button-ghost"}`} href={`/ubicaciones?tipo=${category}`} key={category}>{CATEGORY_LABELS[category]} · {categoryCounts.get(category) ?? 0}</Link>)}</div></section>

    {message ? <div className="error-box">{message}</div> : null}

    {canManage === true ? <section className="panel"><div className="panel-heading"><div><h2>Nueva ubicación</h2><p className="muted">Puedes crear nuevas salas, oficinas o dependencias. Quedarán disponibles en los desplegables de los activos.</p></div></div><form action={createLocation} className="form-grid"><label className="field"><span>Nombre</span><input name="name" placeholder="Ej. Sala 23" required /></label><label className="field"><span>Tipo</span><select defaultValue={selectedType} name="category"><option value="classroom">Salas de clases</option><option value="office">Oficinas</option><option value="dependency">Dependencias</option></select></label><label className="field"><span>Orden</span><input defaultValue="999" min="0" name="display_order" type="number" /></label><label className="field"><span>Área</span><input name="area" placeholder={CATEGORY_LABELS[selectedType]} /></label><label className="field field-wide"><span>Descripción</span><input name="description" placeholder="Referencia o detalle para identificar la ubicación" /></label><div className="form-actions field-wide"><button className="button button-primary" type="submit">Crear ubicación</button></div></form></section> : null}

    <section className="panel"><div className="panel-heading"><div><h2>{CATEGORY_LABELS[selectedType]}</h2><p className="muted">Selecciona una ubicación para ver todos los equipos asignados. Puedes editarla o eliminarla cuando no tenga activos asociados.</p></div></div>{!visibleLocations.length ? <div className="empty-state">No hay ubicaciones oficiales en esta categoría.</div> : <div className="location-list">{visibleLocations.map((location) => {
      const assignedCount = assetCounts.get(location.id) ?? 0;
      return canManage === true ? <article className="location-card" key={location.id}><form action={updateLocation}><input name="location_id" type="hidden" value={location.id} /><div className="location-card-head"><div><strong>{location.name}</strong><span>{assignedCount} activo(s) asociado(s)</span></div><div className="header-actions"><span className="status-pill">Oficial</span><Link className="table-link" href={`/ubicaciones/${location.id}`}>Ver activos</Link></div></div><div className="form-grid"><label className="field"><span>Nombre</span><input defaultValue={location.name} name="name" required /></label><label className="field"><span>Tipo</span><select defaultValue={location.category} name="category"><option value="classroom">Salas de clases</option><option value="office">Oficinas</option><option value="dependency">Dependencias</option><option value="legacy">Heredada</option></select></label><label className="field"><span>Orden</span><input defaultValue={location.display_order} min="0" name="display_order" type="number" /></label><label className="field"><span>Área</span><input defaultValue={location.area ?? ""} name="area" /></label><label className="field field-wide"><span>Descripción</span><input defaultValue={location.description ?? ""} name="description" /></label><label className="field"><span>Estado</span><select defaultValue={String(location.active)} name="active"><option value="true">Activa</option><option value="false">Inactiva</option></select></label><label className="field"><span>Seleccionable</span><select defaultValue={String(location.selectable)} name="selectable"><option value="true">Sí</option><option value="false">No</option></select></label><div className="form-actions field-wide"><button className="button button-secondary" type="submit">Guardar cambios</button></div></div></form><form action={deleteLocation} style={{ marginTop: 12 }}><input name="location_id" type="hidden" value={location.id} /><button className="button button-danger" disabled={assignedCount > 0} title={assignedCount > 0 ? "Mueve primero los activos asociados" : "Eliminar ubicación"} type="submit">{assignedCount > 0 ? "No se puede eliminar: tiene activos" : "Eliminar ubicación"}</button></form></article> : <article className="location-card" key={location.id}><div className="location-card-head"><div><strong>{location.name}</strong><span>{assignedCount} activo(s) asociado(s)</span></div><Link className="table-link" href={`/ubicaciones/${location.id}`}>Ver activos</Link></div>{location.description ? <p className="muted">{location.description}</p> : null}</article>;
    })}</div>}</section>

    {legacyLocations.length ? <section className="panel"><div className="panel-heading"><div><h2>Ubicaciones heredadas pendientes</h2><p className="muted">Se conservan para no mover ni perder información histórica. No aparecen en los selectores de activos nuevos.</p></div><span className="badge">{legacyLocations.length}</span></div><div className="location-list">{legacyLocations.map((location) => <article className="location-card" key={location.id}><div className="location-card-head"><div><strong>{location.name}</strong><span>{assetCounts.get(location.id) ?? 0} activo(s) asociado(s)</span></div><div className="header-actions"><span className="status-pill status-muted">Heredada</span><Link className="table-link" href={`/ubicaciones/${location.id}`}>Ver activos</Link></div></div></article>)}</div></section> : null}
  </AppShell>;
}
