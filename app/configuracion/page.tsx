import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth/require-admin";

function projectRefFromUrl(url: string | undefined) {
  if (!url) return "No configurado";
  try {
    return new URL(url).hostname.split(".")[0] || "Configurado";
  } catch {
    return "Configuración inválida";
  }
}

export const dynamic = "force-dynamic";

export default async function ConfigurationPage() {
  const { supabase, profile } = await requireAdmin();
  const [
    { count: assets },
    { count: families },
    { count: locations },
    { count: pendingImports },
    { count: importErrors },
    { data: latestRun },
  ] = await Promise.all([
    supabase.from("assets").select("id", { count: "exact", head: true }),
    supabase.from("asset_families").select("id", { count: "exact", head: true }).eq("active", true),
    supabase.from("locations").select("id", { count: "exact", head: true }).eq("active", true),
    supabase.from("legacy_imports").select("id", { count: "exact", head: true }).eq("migration_status", "pending"),
    supabase.from("legacy_imports").select("id", { count: "exact", head: true }).eq("migration_status", "error"),
    supabase.from("migration_runs").select("id,status,source_file,finished_at").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const projectRef = projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const publishableConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  return (
    <AppShell>
      <header className="topbar">
        <div><h1>Configuración del sistema</h1><p>Estado operativo, identidad administrativa y controles de seguridad del inventario.</p></div>
        <span className="badge">Solo administrador</span>
      </header>

      <section className="panel panel-flush">
        <div className="panel-heading"><div><h2>Administrador activo</h2><p className="muted">PostgreSQL impide que exista más de un administrador activo al mismo tiempo.</p></div><span className="status-pill">Activo</span></div>
        <div className="detail-grid">
          <div className="detail-item"><span>Correo</span><strong>{profile.email}</strong></div>
          <div className="detail-item"><span>UUID de Auth</span><strong>{profile.id}</strong></div>
          <div className="detail-item"><span>Rol</span><strong>{profile.role}</strong></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h2>Conexión Supabase</h2><p className="muted">Solo se muestran identificadores públicos; ninguna clave secreta se expone en esta pantalla.</p></div></div>
        <div className="detail-grid">
          <div className="detail-item"><span>Project ref</span><strong>{projectRef}</strong></div>
          <div className="detail-item"><span>Publishable key</span><strong>{publishableConfigured ? "Configurada" : "Falta configurar"}</strong></div>
          <div className="detail-item"><span>RLS</span><strong>Obligatorio en tablas del inventario</strong></div>
        </div>
      </section>

      <section className="stats">
        <article className="stat-card"><span>Activos</span><strong>{assets ?? 0}</strong></article>
        <article className="stat-card"><span>Familias</span><strong>{families ?? 0}</strong></article>
        <article className="stat-card"><span>Ubicaciones activas</span><strong>{locations ?? 0}</strong></article>
        <article className="stat-card"><span>Filas Access por resolver</span><strong>{(pendingImports ?? 0) + (importErrors ?? 0)}</strong></article>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h2>Última migración de datos</h2><p className="muted">Estado del último proceso registrado en migration_runs.</p></div></div>
        {latestRun ? <div className="detail-grid"><div className="detail-item"><span>Archivo</span><strong>{latestRun.source_file}</strong></div><div className="detail-item"><span>Estado</span><strong>{latestRun.status}</strong></div><div className="detail-item"><span>Finalización</span><strong>{latestRun.finished_at ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(latestRun.finished_at)) : "En curso"}</strong></div></div> : <div className="empty-state">Aún no se ha ejecutado una migración de datos Access.</div>}
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h2>Controles activos</h2><p className="muted">Defensa en profundidad aplicada al sistema.</p></div></div>
        <div className="rule-grid">
          <article><strong>Sin registro público</strong><span>La aplicación solo implementa inicio de sesión; los usuarios se crean manualmente en Supabase Auth.</span></article>
          <article><strong>Un administrador</strong><span>Un índice parcial único bloquea un segundo administrador activo en la base de datos.</span></article>
          <article><strong>Identidad validada</strong><span>El correo de public.profiles debe coincidir con el usuario real de auth.users.</span></article>
          <article><strong>RLS</strong><span>El acceso a inventario, auditoría e importaciones requiere perfil admin activo.</span></article>
          <article><strong>Auditoría</strong><span>Los cambios de activos y bajas quedan registrados automáticamente.</span></article>
          <article><strong>Legado preservado</strong><span>Cada fila de Access conserva su payload original para reconciliación.</span></article>
        </div>
      </section>
    </AppShell>
  );
}
