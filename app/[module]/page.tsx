import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { InventoryList } from "@/components/inventory/inventory-list";
import { requirePermission } from "@/lib/auth/require-admin";
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

export const dynamic = "force-dynamic";

export default async function ModulePage({ params, searchParams }: { params: Promise<{ module: string }>; searchParams: Promise<InventorySearchParams> }) {
  const { module } = await params; const family = familyModules[module];
  if (!family) notFound();
  await requirePermission("inventory.view");
  return <AppShell><InventoryList basePath={`/${module}`} description={family.description} familyCode={family.code} searchParams={await searchParams} title={family.title} /></AppShell>;
}
