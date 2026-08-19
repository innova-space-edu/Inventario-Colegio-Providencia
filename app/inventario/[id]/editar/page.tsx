import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AssetForm } from "@/components/inventory/asset-form";
import { updateAsset } from "@/app/inventario/actions";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { AssetFormInitial, FamilyCatalog, LocationCatalog, StatusCatalog } from "@/lib/inventory/types";

type Relation<T> = T | T[] | null;
function relationOne<T>(value: Relation<T>): T | null { return Array.isArray(value) ? value[0] ?? null : value; }
function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
export const dynamic = "force-dynamic";

export default async function EditAssetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params; const error = first((await searchParams).error); const { supabase } = await requireAdmin();
  const [{ data: rawAsset }, { data: familyData }, { data: statusData }, { data: locationData }] = await Promise.all([supabase.from("assets").select("*,family:asset_families(code,name)").eq("id", id).maybeSingle(), supabase.from("asset_families").select("id,code,name").eq("active", true).order("name"), supabase.from("asset_statuses").select("id,code,name,is_disposed").eq("active", true).order("name"), supabase.from("locations").select("id,name,area").eq("active", true).order("name")]);
  if (!rawAsset) notFound();
  const asset = rawAsset as typeof rawAsset & { family: Relation<{ code: string; name: string }> }; const family = relationOne(asset.family); let details: Partial<AssetFormInitial> = {};
  if (family?.code === "computer") { const { data } = await supabase.from("computer_details").select("memory,storage,screen,keyboard,battery,charger").eq("asset_id", id).maybeSingle(); details = data ?? {}; }
  else if (family?.code === "projector") { const { data } = await supabase.from("projector_details").select("lumens,hdmi,vga").eq("asset_id", id).maybeSingle(); details = data ?? {}; }
  else if (family?.code === "television") { const { data } = await supabase.from("television_details").select("size").eq("asset_id", id).maybeSingle(); details = data ?? {}; }
  const families = (familyData ?? []) as FamilyCatalog[]; const statuses = (statusData ?? []) as StatusCatalog[]; const locations = (locationData ?? []) as LocationCatalog[];
  const initial: AssetFormInitial = { id: asset.id, inventory_code: asset.inventory_code, family_id: asset.family_id, status_id: asset.status_id, location_id: asset.location_id, name: asset.name, asset_type: asset.asset_type, brand: asset.brand, model: asset.model, serial_number: asset.serial_number, quantity: asset.quantity, area: asset.area, observations: asset.observations, ...details };
  return <AppShell><header className="topbar"><div><h1>Editar activo</h1><p>{asset.inventory_code || asset.name || "Registro de inventario"} · {family?.name || "Sin familia"}</p></div><Link className="button button-ghost" href={`/inventario/${id}`}>Cancelar</Link></header><AssetForm action={updateAsset} error={error} families={families} initial={initial} locations={locations} mode="edit" statuses={statuses} /></AppShell>;
}
