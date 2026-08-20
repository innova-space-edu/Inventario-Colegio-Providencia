import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getPermissionCodes, requireUser } from "@/lib/auth/require-admin";

const moduleCards = [
  ["Computadores", "FORCOMPUTADORAS", "/computadores"], ["Audio", "FORAUDIO", "/audio"], ["Muebles", "FORMUEBLES", "/muebles"], ["Impresoras", "FORIMPRESORAS", "/impresoras"], ["Proyectores", "FORPROYECTORES", "/proyectores"], ["Accesorios", "FORACCESORIOS", "/accesorios"], ["Televisores", "FORTELEVISORES", "/televisores"], ["Varios", "FORVARIOS", "/varios"],
] as const;

const managementCards = [
  { name: "Calidad de datos", description: "Detecta faltantes y series duplicadas", href: "/calidad", permission: "quality.view" },
  { name: "Bajas", description: "Trazabilidad de equipos retirados", href: "/bajas", permission: "inventory.view" },
  { name: "Ubicaciones", description: "Salas y dependencias", href: "/ubicaciones", permission: "locations.view" },
  { name: "Informes", description: "Resumen, PDF y exportaciones CSV", href: "/informes", permission: "reports.view" },
  { name: "Auditoría", description: "Cambios registrados en base de datos", href: "/auditoria", permission: "audit.view" },
  { name: "Importación Access", description: "Control de la migración legado", href: "/importaciones", permission: "imports.view" },
] as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { supabase, profile } = await requireUser();
  const [permissions, rootResult] = await Promise.all([
    getPermissionCodes(supabase),
    supabase.rpc("is_root_admin"),
  ]);
  const permissionSet = new Set(permissions);
  const can = (permission: string) => permissionSet.has(permission);
  const isRoot = rootResult.data === true;
  const canInventory = can("inventory.view");
  const canAudit = can("audit.view");

  const [totalResult, activeResult, disposedResult, familiesResult, recentResult] = await Promise.all([
    canInventory ? supabase.from("assets").select("id", { count: "exact", head: true }) : Promise.resolve({ count: 0 }),
    canInventory ? supabase.from("assets").select("id", { count: "exact", head: true }).eq("is_disposed", false) : Promise.resolve({ count: 0 }),
    canInventory ? supabase.from("assets").select("id", { count: "exact", head: true }).eq("is_disposed", true) : Promise.resolve({ count: 0 }),
    canInventory ? supabase.from("asset_families").select("id", { count: "exact", head: true }).eq("active", true) : Promise.resolve({ count: 0 }),
    canAudit ? supabase.from("audit_logs").select("id,action,table_name,record_id,created_at").order("created_at", { ascending: false }).limit(8) : Promise.resolve({ data: [] }),
  ]);

  const visibleManagement = managementCards.filter((card) => can(card.permission));
  const recent = recentResult.data ?? [];

  return (
    <AppShell>
      <header className="topbar">
        <div><h1>Panel principal</h1><p>Centro de control del inventario tecnológico del Colegio Providencia.</p></div>
        <span className="badge">{isRoot ? "Administrador raíz" : `${permissions.length} permisos`} · {profile.email}</span>
      </header>

      {canInventory ? <section className="stats">
        <article className="stat-card"><span>Inventario total</span><strong>{totalResult.count ?? 0}</strong></article>
        <article className="stat-card"><span>Equipos activos</span><strong>{activeResult.count ?? 0}</strong></article>
        <article className="stat-card"><span>Dados de baja</span><strong>{disposedResult.count ?? 0}</strong></article>
        <article className="stat-card"><span>Familias activas</span><strong>{familiesResult.count ?? 0}</strong></article>
      </section> : null}

      {canInventory ? <section className="panel">
        <div className="panel-heading"><div><h2>Familias tecnológicas</h2><p className="muted">Accesos disponibles según tu rol.</p></div>{can("inventory.create") ? <Link className="button button-primary" href="/inventario/nuevo">Nuevo activo</Link> : null}</div>
        <div className="module-grid">{moduleCards.map(([name, legacy, href]) => <Link className="module-card" href={href} key={name}><strong>{name}</strong><span>Origen Access: {legacy}</span></Link>)}</div>
      </section> : null}

      {(visibleManagement.length > 0 || isRoot) ? <section className="panel">
        <div className="panel-heading"><div><h2>Gestión y control</h2><p className="muted">Solo aparecen módulos autorizados para esta cuenta.</p></div></div>
        <div className="management-grid">
          {visibleManagement.map((card) => <Link className="management-card" href={card.href} key={card.name}><strong>{card.name}</strong><span>{card.description}</span></Link>)}
          {isRoot ? <Link className="management-card" href="/usuarios"><strong>Usuarios</strong><span>Cuentas, activación y asignación de roles</span></Link> : null}
          {isRoot ? <Link className="management-card" href="/roles"><strong>Roles y permisos</strong><span>Crear roles y administrar la matriz de permisos</span></Link> : null}
        </div>
      </section> : null}

      {canAudit ? <section className="panel"><div className="panel-heading"><div><h2>Actividad reciente</h2><p className="muted">Cambios registrados automáticamente en la base de datos.</p></div></div>{recent.length ? <div className="timeline">{recent.map((event) => <article key={event.id}><div><strong>{event.action} · {event.table_name}</strong><span>{event.record_id || "Sin identificador"}</span></div><time>{formatDate(event.created_at)}</time></article>)}</div> : <div className="empty-state">Aún no hay actividad para mostrar.</div>}</section> : null}

      {!canInventory && visibleManagement.length === 0 && !isRoot ? <section className="panel"><div className="empty-state">Tu cuenta está activa, pero todavía no tiene permisos asignados. Solicita al administrador raíz que te asigne un rol.</div></section> : null}
    </AppShell>
  );
}
