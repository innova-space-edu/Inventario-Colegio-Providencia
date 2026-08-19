import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth/require-admin";

const moduleCards = [
  ["Computadores", "FORCOMPUTADORAS", "/computadores"],
  ["Audio", "FORAUDIO", "/audio"],
  ["Muebles", "FORMUEBLES", "/muebles"],
  ["Impresoras", "FORIMPRESORAS", "/impresoras"],
  ["Proyectores", "FORPROYECTORES", "/proyectores"],
  ["Accesorios", "FORACCESORIOS", "/accesorios"],
  ["Televisores", "FORTELEVISORES", "/televisores"],
  ["Varios", "FORVARIOS", "/varios"],
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { supabase, profile } = await requireAdmin();

  const [{ count: total }, { count: active }, { count: disposed }, { count: families }, { data: recent }] = await Promise.all([
    supabase.from("assets").select("id", { count: "exact", head: true }),
    supabase.from("assets").select("id", { count: "exact", head: true }).eq("is_disposed", false),
    supabase.from("assets").select("id", { count: "exact", head: true }).eq("is_disposed", true),
    supabase.from("asset_families").select("id", { count: "exact", head: true }).eq("active", true),
    supabase.from("audit_logs").select("id,action,table_name,record_id,created_at").order("created_at", { ascending: false }).limit(8),
  ]);

  return (
    <AppShell>
      <header className="topbar">
        <div><h1>Panel principal</h1><p>Centro de control que reemplaza el MENÚ GENERAL de Microsoft Access.</p></div>
        <span className="badge">Administrador · {profile.email}</span>
      </header>

      <section className="stats">
        <article className="stat-card"><span>Inventario total</span><strong>{total ?? 0}</strong></article>
        <article className="stat-card"><span>Equipos activos</span><strong>{active ?? 0}</strong></article>
        <article className="stat-card"><span>Dados de baja</span><strong>{disposed ?? 0}</strong></article>
        <article className="stat-card"><span>Familias activas</span><strong>{families ?? 0}</strong></article>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h2>Familias tecnológicas</h2><p className="muted">Acceso directo a cada familia reconstruida desde Access.</p></div><Link className="button button-primary" href="/inventario/nuevo">Nuevo activo</Link></div>
        <div className="module-grid">
          {moduleCards.map(([name, legacy, href]) => (
            <Link className="module-card" href={href} key={name}><strong>{name}</strong><span>Origen Access: {legacy}</span></Link>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h2>Actividad reciente</h2><p className="muted">Cambios registrados automáticamente en la base de datos.</p></div></div>
        {recent?.length ? (
          <div className="timeline">{recent.map((event) => <article key={event.id}><div><strong>{event.action} · {event.table_name}</strong><span>{event.record_id || "Sin identificador"}</span></div><time>{formatDate(event.created_at)}</time></article>)}</div>
        ) : <div className="empty-state">La actividad aparecerá aquí cuando comience la carga y edición de activos.</div>}
      </section>
    </AppShell>
  );
}
