import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth/require-admin";

type CountRow = { id: string; label: string; count: number };

function ReportTable({ title, rows, total }: { title: string; rows: CountRow[]; total: number }) {
  return (
    <section className="panel report-panel">
      <div className="panel-heading"><div><h2>{title}</h2><p className="muted">Distribución de activos vigentes.</p></div></div>
      {!rows.length ? <div className="empty-state">Sin datos para mostrar.</div> : <div className="report-list">{rows.map((row) => {
        const percentage = total > 0 ? Math.round((row.count / total) * 100) : 0;
        return <article key={row.id}><div className="report-row-head"><strong>{row.label}</strong><span>{row.count} · {percentage}%</span></div><div className="report-bar"><span style={{ width: `${percentage}%` }} /></div></article>;
      })}</div>}
    </section>
  );
}

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const { supabase } = await requireAdmin();
  const [{ count: total }, { count: active }, { count: disposed }, { data: families }, { data: statuses }, { data: locations }] = await Promise.all([
    supabase.from("assets").select("id", { count: "exact", head: true }),
    supabase.from("assets").select("id", { count: "exact", head: true }).eq("is_disposed", false),
    supabase.from("assets").select("id", { count: "exact", head: true }).eq("is_disposed", true),
    supabase.from("asset_families").select("id,name").eq("active", true).order("name"),
    supabase.from("asset_statuses").select("id,name,is_disposed").eq("active", true).order("name"),
    supabase.from("locations").select("id,name").eq("active", true).order("name"),
  ]);

  const activeTotal = active ?? 0;
  const familyRows: CountRow[] = await Promise.all((families ?? []).map(async (family) => {
    const { count } = await supabase.from("assets").select("id", { count: "exact", head: true }).eq("family_id", family.id).eq("is_disposed", false);
    return { id: family.id, label: family.name, count: count ?? 0 };
  }));
  const statusRows: CountRow[] = await Promise.all((statuses ?? []).filter((status) => !status.is_disposed).map(async (status) => {
    const { count } = await supabase.from("assets").select("id", { count: "exact", head: true }).eq("status_id", status.id).eq("is_disposed", false);
    return { id: status.id, label: status.name, count: count ?? 0 };
  }));
  const locationRows: CountRow[] = await Promise.all((locations ?? []).map(async (location) => {
    const { count } = await supabase.from("assets").select("id", { count: "exact", head: true }).eq("location_id", location.id).eq("is_disposed", false);
    return { id: location.id, label: location.name, count: count ?? 0 };
  }));

  return (
    <AppShell>
      <header className="topbar"><div><h1>Informes</h1><p>Resumen operativo y exportaciones del inventario tecnológico.</p></div><span className="badge">Corte actual</span></header>
      <section className="stats">
        <article className="stat-card"><span>Total histórico</span><strong>{total ?? 0}</strong></article>
        <article className="stat-card"><span>Activos vigentes</span><strong>{activeTotal}</strong></article>
        <article className="stat-card"><span>Dados de baja</span><strong>{disposed ?? 0}</strong></article>
        <article className="stat-card"><span>Ubicaciones activas</span><strong>{locations?.length ?? 0}</strong></article>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h2>Exportar</h2><p className="muted">Archivos CSV compatibles con Excel y herramientas de análisis.</p></div></div>
        <div className="export-grid">
          <Link className="export-card" href="/api/export/assets?scope=all"><strong>Inventario completo</strong><span>Incluye activos vigentes y dados de baja.</span></Link>
          <Link className="export-card" href="/api/export/assets?scope=active"><strong>Solo activos vigentes</strong><span>Útil para revisión física y control operativo.</span></Link>
          <Link className="export-card" href="/api/export/assets?scope=disposed"><strong>Registro de bajas</strong><span>Consolida todos los equipos retirados.</span></Link>
        </div>
      </section>

      <div className="report-grid"><ReportTable rows={familyRows.filter((row) => row.count > 0)} title="Por familia tecnológica" total={activeTotal} /><ReportTable rows={statusRows.filter((row) => row.count > 0)} title="Por estado" total={activeTotal} /></div>
      <ReportTable rows={locationRows.filter((row) => row.count > 0)} title="Por ubicación" total={activeTotal} />
    </AppShell>
  );
}
