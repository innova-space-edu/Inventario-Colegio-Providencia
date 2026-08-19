import { AppShell } from "@/components/app-shell";
import { createLocation, updateLocation } from "@/app/ubicaciones/actions";
import { requireAdmin } from "@/lib/auth/require-admin";

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }

export const dynamic = "force-dynamic";

export default async function LocationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const state = await searchParams;
  const error = first(state.error);
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("locations").select("id,name,area,description,active,legacy_value,updated_at").order("active", { ascending: false }).order("name");
  const locations = data ?? [];

  const counts = await Promise.all(locations.map(async (location) => {
    const { count } = await supabase.from("assets").select("id", { count: "exact", head: true }).eq("location_id", location.id).eq("is_disposed", false);
    return [location.id, count ?? 0] as const;
  }));
  const assetCounts = new Map(counts);

  return (
    <AppShell>
      <header className="topbar"><div><h1>Ubicaciones</h1><p>Catálogo de salas, dependencias y áreas físicas usadas para localizar los activos.</p></div><span className="badge">{locations.filter((location) => location.active).length} activas</span></header>

      <section className="panel">
        <div className="panel-heading"><div><h2>Nueva ubicación</h2><p className="muted">Crea una dependencia reutilizable en todo el inventario.</p></div></div>
        {error ? <div className="error-box">No fue posible completar la operación. Revisa el nombre y evita duplicados.</div> : null}
        <form action={createLocation} className="form-grid">
          <label className="field"><span>Nombre</span><input name="name" placeholder="Ej. Laboratorio de Computación" required /></label>
          <label className="field"><span>Área</span><input name="area" placeholder="Ej. Segundo piso" /></label>
          <label className="field field-wide"><span>Descripción</span><input name="description" placeholder="Referencia o detalle para identificar la dependencia" /></label>
          <div className="form-actions field-wide"><button className="button button-primary" type="submit">Crear ubicación</button></div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h2>Catálogo</h2><p className="muted">Desactivar una ubicación no elimina los activos ya asociados a ella.</p></div></div>
        {!locations.length ? <div className="empty-state">Todavía no hay ubicaciones registradas.</div> : null}
        {locations.length ? <div className="location-list">{locations.map((location) => (
          <form action={updateLocation} className="location-card" key={location.id}>
            <input name="location_id" type="hidden" value={location.id} />
            <div className="location-card-head"><div><strong>{location.name}</strong><span>{assetCounts.get(location.id) ?? 0} activo(s) vigente(s)</span></div><span className={`status-pill ${location.active ? "" : "status-muted"}`}>{location.active ? "Activa" : "Inactiva"}</span></div>
            <div className="form-grid">
              <label className="field"><span>Nombre</span><input defaultValue={location.name} name="name" required /></label>
              <label className="field"><span>Área</span><input defaultValue={location.area ?? ""} name="area" /></label>
              <label className="field field-wide"><span>Descripción</span><input defaultValue={location.description ?? ""} name="description" /></label>
              <label className="field"><span>Estado</span><select defaultValue={String(location.active)} name="active"><option value="true">Activa</option><option value="false">Inactiva</option></select></label>
              <div className="form-actions"><button className="button button-secondary" type="submit">Guardar</button></div>
            </div>
          </form>
        ))}</div> : null}
      </section>
    </AppShell>
  );
}
