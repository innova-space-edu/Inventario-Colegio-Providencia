import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/auth/require-admin";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const { supabase } = await requirePermission("imports.view");
  const [
    { data: canManage },
    { count: pending },
    { count: migrated },
    { count: ignored },
    { count: errors },
    { count: pendingDisposals },
    { data: runs },
  ] = await Promise.all([
    supabase.rpc("has_permission", { p_permission: "imports.manage" }),
    supabase.from("legacy_imports").select("id", { count: "exact", head: true }).eq("migration_status", "pending"),
    supabase.from("legacy_imports").select("id", { count: "exact", head: true }).eq("migration_status", "migrated"),
    supabase.from("legacy_imports").select("id", { count: "exact", head: true }).eq("migration_status", "ignored"),
    supabase.from("legacy_imports").select("id", { count: "exact", head: true }).eq("migration_status", "error"),
    supabase.from("legacy_imports").select("id", { count: "exact", head: true }).ilike("source_table", "%BAJA%").in("migration_status", ["pending", "error"]),
    supabase.from("migration_runs").select("id,source_file,source_sha256,started_at,finished_at,status,source_rows,imported_rows,rejected_rows,notes").order("started_at", { ascending: false }).limit(20),
  ]);

  const preservationCounts = new Map<string, number>();
  await Promise.all((runs ?? []).map(async (run) => {
    const { count } = await supabase
      .from("legacy_imports")
      .select("id", { count: "exact", head: true })
      .eq("last_seen_run_id", run.id);
    preservationCounts.set(run.id, count ?? 0);
  }));

  return (
    <AppShell>
      <header className="topbar">
        <div><h1>Importación desde Access</h1><p>Centro de control para migrar el archivo original sin perder registros ni trazabilidad.</p></div>
        <div className="header-actions">
          {canManage === true ? <><Link className="button button-secondary" href="/importaciones/revision">Revisar filas legado</Link><Link className="button button-secondary" href="/importaciones/bajas">Bajas Access · {pendingDisposals ?? 0}</Link></> : null}
          <span className="badge">Colegio Providencia(1).accdb</span>
        </div>
      </header>

      <section className="stats">
        <article className="stat-card"><span>Pendientes</span><strong>{pending ?? 0}</strong></article>
        <article className="stat-card"><span>Migrados</span><strong>{migrated ?? 0}</strong></article>
        <article className="stat-card"><span>Ignorados</span><strong>{ignored ?? 0}</strong></article>
        <article className="stat-card"><span>Errores</span><strong>{errors ?? 0}</strong></article>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h2>Pipeline de migración</h2><p className="muted">La carga real exige exportar, validar y reconciliar antes de considerar cerrada la migración.</p></div><Link className="button button-ghost" href="https://github.com/innova-space-edu/Inventario-Colegio-Providencia/blob/main/docs/ACCESS_MIGRATION.md">Ver guía</Link></div>
        <div className="rule-grid">
          <article><strong>1. Exportar</strong><span>scripts/export-access.ps1 lee las tablas mediante Microsoft ACE sin modificar el .accdb.</span></article>
          <article><strong>2. Validar</strong><span>El preflight comprueba conteos, identidades estables, códigos, series y el SHA-256 de la fuente cuando está disponible.</span></article>
          <article><strong>3. Preservar e importar</strong><span>Cada fila entra primero a legacy_imports, queda vinculada a una ejecución y conserva el payload original.</span></article>
          <article><strong>4. Reconciliar</strong><span>La cantidad preservada debe cuadrar exactamente con las filas fuente antes de cerrar una ejecución.</span></article>
        </div>
      </section>

      {canManage === true ? <section className="panel"><div className="panel-heading"><div><h2>Bajas históricas</h2><p className="muted">Las tablas BAJA no se vinculan automáticamente para evitar retirar el activo equivocado cuando existen códigos o series repetidos.</p></div><Link className="button button-primary" href="/importaciones/bajas">Reconciliar bajas ({pendingDisposals ?? 0})</Link></div></section> : null}

      <section className="panel">
        <div className="panel-heading"><div><h2>Ejecuciones</h2><p className="muted">Cada corrida compara filas fuente con filas preservadas en Supabase.</p></div></div>
        {runs?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Inicio</th><th>Archivo</th><th>Estado</th><th>Fuente</th><th>Preservadas</th><th>Importadas</th><th>Rechazadas</th><th>Notas</th></tr></thead><tbody>{runs.map((run) => {
          const preserved = preservationCounts.get(run.id) ?? 0;
          const source = run.source_rows;
          const balanced = source !== null && source !== undefined && preserved === source;
          return <tr key={run.id}><td>{formatDate(run.started_at)}</td><td>{run.source_file}</td><td><span className={`status-pill ${run.status === "failed" ? "status-danger" : ""}`}>{run.status}</span></td><td>{source ?? "—"}</td><td><span className={`status-pill ${source !== null && source !== undefined && !balanced ? "status-danger" : ""}`}>{source === null || source === undefined ? preserved : `${preserved}/${source}`}</span></td><td>{run.imported_rows ?? "—"}</td><td>{run.rejected_rows ?? "—"}</td><td>{run.notes || "—"}</td></tr>;
        })}</tbody></table></div> : <div className="empty-state">Todavía no se ha ejecutado una importación.</div>}
      </section>
    </AppShell>
  );
}
