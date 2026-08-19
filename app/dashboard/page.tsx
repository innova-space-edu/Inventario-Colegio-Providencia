import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth/require-admin";

const moduleCards = [
  ["Computadores", "FORCOMPUTADORAS"],
  ["Audio", "FORAUDIO"],
  ["Muebles", "FORMUEBLES"],
  ["Impresoras", "FORIMPRESORAS"],
  ["Proyectores", "FORPROYECTORES"],
  ["Accesorios", "FORACCESORIOS"],
  ["Televisores", "FORTELEVISORES"],
  ["Varios", "FORVARIOS"],
];

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { supabase, profile } = await requireAdmin();

  const [{ count: total }, { count: active }, { count: disposed }] = await Promise.all([
    supabase.from("assets").select("id", { count: "exact", head: true }),
    supabase.from("assets").select("id", { count: "exact", head: true }).eq("is_disposed", false),
    supabase.from("assets").select("id", { count: "exact", head: true }).eq("is_disposed", true),
  ]);

  return (
    <AppShell>
      <header className="topbar">
        <div><h1>Panel principal</h1><p>Este panel reemplaza el MENÚ GENERAL de Microsoft Access.</p></div>
        <span className="badge">Administrador · {profile.email}</span>
      </header>

      <section className="stats">
        <article className="stat-card"><span>Inventario total</span><strong>{total ?? 0}</strong></article>
        <article className="stat-card"><span>Equipos activos</span><strong>{active ?? 0}</strong></article>
        <article className="stat-card"><span>Dados de baja</span><strong>{disposed ?? 0}</strong></article>
        <article className="stat-card"><span>Familias base</span><strong>8</strong></article>
      </section>

      <section className="panel">
        <h2>Familias tecnológicas</h2>
        <div className="module-grid">
          {moduleCards.map(([name, legacy]) => (
            <article className="module-card" key={name}><strong>{name}</strong><span>Origen Access: {legacy}</span></article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Actividad reciente</h2>
        <div className="empty-state">La actividad aparecerá aquí cuando comencemos la importación y edición de activos.</div>
      </section>
    </AppShell>
  );
}
