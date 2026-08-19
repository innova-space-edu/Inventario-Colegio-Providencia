import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth/require-admin";

const modules: Record<string, { title: string; description: string }> = {
  inventario: { title: "Inventario general", description: "Búsqueda, filtros y administración de todos los activos." },
  computadores: { title: "Computadores", description: "Reconstrucción del formulario FORCOMPUTADORAS." },
  impresoras: { title: "Impresoras", description: "Reconstrucción del formulario FORIMPRESORAS." },
  proyectores: { title: "Proyectores", description: "Reconstrucción del formulario FORPROYECTORES." },
  audio: { title: "Audio", description: "Reconstrucción del formulario FORAUDIO." },
  televisores: { title: "Televisores", description: "Reconstrucción del formulario FORTELEVISORES." },
  muebles: { title: "Muebles", description: "Reconstrucción del formulario FORMUEBLES." },
  accesorios: { title: "Accesorios", description: "Reconstrucción del formulario FORACCESORIOS." },
  varios: { title: "Varios", description: "Reconstrucción del formulario FORVARIOS." },
  bajas: { title: "Baja de equipos", description: "Historial y trazabilidad de equipos retirados del inventario." },
  informes: { title: "Informes", description: "Informes, impresión y exportaciones del inventario." },
};

export const dynamic = "force-dynamic";

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const config = modules[module];
  if (!config) notFound();

  await requireAdmin();

  return (
    <AppShell>
      <header className="topbar">
        <div><h1>{config.title}</h1><p>{config.description}</p></div>
        <span className="badge">En construcción</span>
      </header>
      <section className="panel">
        <div className="empty-state">El núcleo seguro ya está preparado. Este módulo se implementará sobre los datos migrados desde Access.</div>
      </section>
    </AppShell>
  );
}
