import { AppShell } from "@/components/app-shell";
import { InventoryList } from "@/components/inventory/inventory-list";
import type { InventorySearchParams } from "@/lib/inventory/types";

export const dynamic = "force-dynamic";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<InventorySearchParams> }) {
  return (
    <AppShell>
      <InventoryList
        basePath="/inventario"
        description="Búsqueda, filtros y administración de todos los activos tecnológicos del colegio."
        searchParams={await searchParams}
        title="Inventario general"
      />
    </AppShell>
  );
}
