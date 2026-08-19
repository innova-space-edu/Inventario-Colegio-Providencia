import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AssetForm } from "@/components/inventory/asset-form";
import { createAsset } from "@/app/inventario/actions";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { FamilyCatalog, LocationCatalog, StatusCatalog } from "@/lib/inventory/types";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export const dynamic = "force-dynamic";

export default async function NewAssetPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const familyCode = first(params.familia);
  const error = first(params.error);
  const { supabase } = await requireAdmin();

  const [{ data: familyData }, { data: statusData }, { data: locationData }] = await Promise.all([
    supabase.from("asset_families").select("id,code,name").eq("active", true).order("name"),
    supabase.from("asset_statuses").select("id,code,name,is_disposed").eq("active", true).order("name"),
    supabase.from("locations").select("id,name,area").eq("active", true).order("name"),
  ]);

  const families = (familyData ?? []) as FamilyCatalog[];
  const statuses = (statusData ?? []) as StatusCatalog[];
  const locations = (locationData ?? []) as LocationCatalog[];
  const defaultFamily = families.find((family) => family.code === familyCode) ?? families[0];
  const defaultStatus = statuses.find((status) => status.code === "operational") ?? statuses.find((status) => !status.is_disposed);

  return (
    <AppShell>
      <header className="topbar">
        <div><h1>Nuevo activo</h1><p>Registra un elemento nuevo manteniendo la estructura de familias del inventario original.</p></div>
        <Link className="button button-ghost" href="/inventario">Volver al inventario</Link>
      </header>
      <AssetForm
        action={createAsset}
        error={error}
        families={families}
        initial={{ family_id: defaultFamily?.id, status_id: defaultStatus?.id }}
        locations={locations}
        statuses={statuses}
      />
    </AppShell>
  );
}
