import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

function projectRefFromUrl(url: string | undefined) {
  if (!url) return "No configurado";
  try { return new URL(url).hostname.split(".")[0] || "Configurado"; } catch { return "Configuración inválida"; }
}

export const dynamic = "force-dynamic";

export default async function ConfigurationPage() {
  const { supabase, profile } = await requirePermission("system.view");
  const admin = createAdminClient();
  let authAdminStatus = admin ? "Configurada" : "Falta SUPABASE_SECRET_KEY";
  if (admin) {
    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    authAdminStatus = error ? "Clave configurada, pero Auth Admin respondió con error" : "Operativa";
  }

  const [{ count: assets }, { count: families }, { count: locations }, { count: pendingImports }, { count: importErrors }, { data: latestRun }, rootResult] = await Promise.all([
    supabase.from("assets").select("id", { count: "exact", head: true }),
    supabase.from("asset_families").select("id", { count: "exact", head: true }).eq("active", true),
    supabase.from("locations").select("id", { count: "exact", head: true }).eq("active", true),
    supabase.from("legacy_imports").select("id", { count: "exact", head: true }).eq("migration_status", "pending"),
    supabase.from("legacy_imports").select("id", { count: "exact", head: true }).eq("migration_status", "error"),
    supabase.from("migration_runs").select("id,status,source_file,finished_at").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.rpc("is_root_admin"),
  ]);

  const projectRef = projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const publishableConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const isRoot = rootResult.data === true;

  return <AppShell>
    <header className="topbar"><div><h1>Configuración del sistema</h1><p>Estado operativo, autorización y controles de seguridad del inventario.</p></div><span className="badge">{isRoot ? "Administrador raíz" : "Acceso system.view"}</span></header>
    <section className="panel panel-flush"><div className="panel-heading"><div><h2>Identidad activa</h2><p className="muted">La autorización final se valida con roles, permisos y RLS.</p></div><span className="status-pill">Activo</span></div><div className="detail-grid"><div className="detail-item"><span>Correo</span><strong>{profile.email}</strong></div><div className="detail-item"><span>UUID de Auth</span><strong>{profile.id}</strong></div><div className="detail-item"><span>Administrador raíz</span><strong>{isRoot ? "Sí" : "No"}</strong></div></div></section>
    <section className="panel"><div className="panel-heading"><div><h2>Conexión Supabase</h2><p className="muted">Ninguna clave se muestra; solo verificamos si el servicio responde correctamente.</p></div></div><div className="detail-grid"><div className="detail-item"><span>Project ref</span><strong>{projectRef}</strong></div><div className="detail-item"><span>Publishable key</span><strong>{publishableConfigured ? "Configurada" : "Falta configurar"}</strong></div><div className="detail-item"><span>Auth Admin API</span><strong>{authAdminStatus}</strong></div></div></section>
    <section className="stats"><article className="stat-card"><span>Activos visibles</span><strong>{assets ?? 0}</strong></article><article className="stat-card"><span>Familias visibles</span><strong>{families ?? 0}</strong></article><article className="stat-card"><span>Ubicaciones visibles</span><strong>{locations ?? 0}</strong></article><article className="stat-card"><span>Filas Access por resolver</span><strong>{(pendingImports ?? 0) + (importErrors ?? 0)}</strong></article></section>
    <section className="panel"><div className="panel-heading"><div><h2>Última migración de datos</h2><p className="muted">Estado del último proceso registrado.</p></div></div>{latestRun ? <div className="detail-grid"><div className="detail-item"><span>Archivo</span><strong>{latestRun.source_file}</strong></div><div className="detail-item"><span>Estado</span><strong>{latestRun.status}</strong></div><div className="detail-item"><span>Finalización</span><strong>{latestRun.finished_at ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(latestRun.finished_at)) : "En curso"}</strong></div></div> : <div className="empty-state">Aún no se ha ejecutado una migración de datos Access.</div>}</section>
    <section className="panel"><div className="panel-heading"><div><h2>Controles activos</h2><p className="muted">Defensa en profundidad aplicada al sistema.</p></div></div><div className="rule-grid"><article><strong>RBAC</strong><span>Los módulos y operaciones responden a permisos asignados por rol.</span></article><article><strong>RLS</strong><span>PostgreSQL vuelve a validar permisos aunque una URL se invoque directamente.</span></article><article><strong>Administrador raíz protegido</strong><span>admin@colprovidencia.cl no puede perder super_admin desde la aplicación.</span></article><article><strong>Auth Admin server-side</strong><span>La Secret Key se utiliza solo para administración de usuarios en servidor.</span></article><article><strong>Auditoría</strong><span>Los cambios críticos quedan registrados automáticamente.</span></article><article><strong>Legado preservado</strong><span>Cada fila Access conserva su payload original para reconciliación.</span></article></div></section>
  </AppShell>;
}
