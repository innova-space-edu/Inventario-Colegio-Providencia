import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth/require-admin";

function formatDate(value: string) { return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const { supabase } = await requireAdmin();
  const [{ count: pending }, { count: migrated }, { count: ignored }, { count: errors }, { data: runs }] = await Promise.all([
    supabase.from("legacy_imports").select("id", { count: "exact", head: true }).eq("migration_status", "pending"),
    supabase.from("legacy_imports").select("id", { count: "exact", head: true }).eq("migration_status", "migrated"),
    supabase.from("legacy_imports").select("id", { count: "exact", head: true }).eq("migration_status", "ignored"),
    supabase.from("legacy_imports").select("id", { count: "exact", head: true }).eq("migration_status", "error"),
    supabase.from("migration_runs").select("id,source_file,source_sha256,started_at,finished_at,status,source_rows,imported_rows,rejected_rows,notes").order("started_at", { ascending: false }).limit(20),
  ]);

  return (
    <AppShell>
      <header className="topbar"><div><h1>Importación desde Access</h1><p>Centro de control para migrar el archivo original sin perder registros ni trazabilidad.</p></div><span className="badge">Colegio Providencia(1).accdb</span></header>
      <section className="stats">
        <article className="stat-card"><span>Pendientes</span><strong>{pending ?? 0}</strong></article>
        <article className="stat-card"><span>Migrados</span><strong>{migrated ?? 0}</strong></article>
        <article className="stat-card"><span>Ignorados</span><strong>{ignored ?? 0}</strong></article>
        <article className="stat-card"><span>Errores</span><strong>{errors ?? 0}</strong></article>
      </section>
      <section className="panel"><div className="panel-heading"><div><h2>Reglas de migración</h2><p className="muted">La importación se ejecutará por lotes después de extraer y validar cada tabla del archivo Access.</p></div></div><div className="rule-grid"><article><strong>1. Conservación</strong><span>Ningún registro legado se elimina ni se sobrescribe silenciosamente.</span></article><article><strong>2. Trazabilidad</strong><span>Cada fila mantiene su tabla, ID y payload original en legacy_data.</span></article><article><strong>3. Reconciliación</strong><span>Antes de cerrar un lote se comparan filas fuente, importadas y rechazadas.</span></article><article><strong>4. Repetibilidad</strong><span>El hash del archivo y migration_runs permiten auditar cada ejecución.</span></article></div></section>
      <section className="panel"><div className="panel-heading"><div><h2>Ejecuciones</h2><p className="muted">Historial de procesos de migración.</p></div></div>{runs?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Inicio</th><th>Archivo</th><th>Estado</th><th>Fuente</th><th>Importadas</th><th>Rechazadas</th><th>Notas</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id}><td>{formatDate(run.started_at)}</td><td>{run.source_file}</td><td><span className="status-pill">{run.status}</span></td><td>{run.source_rows ?? "—"}</td><td>{run.imported_rows ?? "—"}</td><td>{run.rejected_rows ?? "—"}</td><td>{run.notes || "—"}</td></tr>)}</tbody></table></div> : <div className="empty-state">Todavía no se ha ejecutado una importación. El sistema está preparado para registrar cada lote cuando comience la carga real.</div>}</section>
    </AppShell>
  );
}
