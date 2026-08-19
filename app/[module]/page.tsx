import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { InventoryList } from "@/components/inventory/inventory-list";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { InventorySearchParams } from "@/lib/inventory/types";

const familyModules: Record<string, { title: string; description: string; code: string }> = {
  computadores: { title: "Computadores", description: "Inventario de computadores y especificaciones del formulario FORCOMPUTADORAS.", code: "computer" },
  impresoras: { title: "Impresoras", description: "Inventario de impresoras proveniente de FORIMPRESORAS.", code: "printer" },
  proyectores: { title: "Proyectores", description: "Inventario de proyectores y conectividad del formulario FORPROYECTORES.", code: "projector" },
  audio: { title: "Audio", description: "Equipos de audio provenientes de FORAUDIO.", code: "audio" },
  televisores: { title: "Televisores", description: "Inventario de televisores proveniente de FORTELEVISORES.", code: "television" },
  muebles: { title: "Muebles", description: "Mobiliario tecnológico proveniente de FORMUEBLES.", code: "furniture" },
  accesorios: { title: "Accesorios", description: "Accesorios tecnológicos provenientes de FORACCESORIOS.", code: "accessory" },
  varios: { title: "Varios", description: "Elementos tecnológicos diversos provenientes de FORVARIOS.", code: "misc" },
};

const pendingModules: Record<string, { title: string; description: string }> = {
  bajas: { title: "Baja de equipos", description: "Historial y trazabilidad de equipos retirados del inventario." },
  informes: { title: "Informes", description: "Informes, impresión y exportaciones del inventario." },
};

export const dynamic = "force-dynamic";

export default async function ModulePage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<InventorySearchParams>;
}) {
  const { module } = await params;
  const family = familyModules[module];

  if (family) {
    return (
      <AppShell>
        <InventoryList
          basePath={`/${module}`}
          description={family.description}
          familyCode={family.code}
          searchParams={await searchParams}
          title={family.title}
        />
      </AppShell>
    );
  }

  const pending = pendingModules[module];
  if (!pending) notFound();
  await requireAdmin();

  return (
    <AppShell>
      <header className="topbar"><div><h1>{pending.title}</h1><p>{pending.description}</p></div><span className="badge">Siguiente fase</span></header>
      <section className="panel"><div className="empty-state">Este módulo se implementará sobre el núcleo CRUD que ya está disponible en Inventario general y en las ocho familias tecnológicas.</div></section>
    </AppShell>
  );
}
