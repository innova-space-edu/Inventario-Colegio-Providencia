"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/require-admin";

function text(formData: FormData, key: string) { const value = String(formData.get(key) ?? "").trim(); return value || null; }
function requiredText(formData: FormData, key: string) { const value = text(formData, key); if (!value) throw new Error(`Missing required field: ${key}`); return value; }
function quantity(formData: FormData) { const value = Number(formData.get("quantity") ?? 1); return Number.isInteger(value) && value > 0 ? value : 1; }

function commonPayload(formData: FormData) {
  return { inventory_code: text(formData, "inventory_code"), status_id: text(formData, "status_id"), location_id: text(formData, "location_id"), name: text(formData, "name"), asset_type: text(formData, "asset_type"), brand: text(formData, "brand"), model: text(formData, "model"), serial_number: text(formData, "serial_number"), quantity: quantity(formData), area: text(formData, "area"), observations: text(formData, "observations") };
}

function detailPayload(formData: FormData) {
  return { memory: text(formData, "memory"), storage: text(formData, "storage"), screen: text(formData, "screen"), keyboard: text(formData, "keyboard"), battery: text(formData, "battery"), charger: text(formData, "charger"), lumens: text(formData, "lumens"), hdmi: text(formData, "hdmi"), vga: text(formData, "vga"), size: text(formData, "size") };
}

export async function createAsset(formData: FormData) {
  const { supabase } = await requirePermission("inventory.create");
  const familyId = requiredText(formData, "family_id");
  const { data: assetId, error } = await supabase.rpc("create_asset_atomic", { p_asset: { ...commonPayload(formData), family_id: familyId }, p_details: detailPayload(formData) });
  if (error || !assetId) redirect("/inventario/nuevo?error=save");
  revalidatePath("/dashboard"); revalidatePath("/inventario"); revalidatePath("/calidad"); redirect(`/inventario/${assetId}?created=1`);
}

export async function updateAsset(formData: FormData) {
  const { supabase } = await requirePermission("inventory.edit");
  const assetId = requiredText(formData, "asset_id");
  const { error } = await supabase.rpc("update_asset_atomic", { p_asset_id: assetId, p_asset: commonPayload(formData), p_details: detailPayload(formData) });
  if (error) redirect(`/inventario/${assetId}/editar?error=save`);
  revalidatePath("/dashboard"); revalidatePath("/inventario"); revalidatePath("/calidad"); revalidatePath(`/inventario/${assetId}`); redirect(`/inventario/${assetId}?updated=1`);
}

export async function disposeAsset(formData: FormData) {
  const { supabase } = await requirePermission("inventory.dispose");
  const assetId = requiredText(formData, "asset_id");
  const reason = requiredText(formData, "reason");
  const { error } = await supabase.rpc("dispose_asset_atomic", { p_asset_id: assetId, p_reason: reason, p_observations: text(formData, "disposal_observations"), p_approved_by: text(formData, "approved_by") });
  if (error) redirect(`/inventario/${assetId}?error=dispose`);
  revalidatePath("/dashboard"); revalidatePath("/inventario"); revalidatePath("/bajas"); revalidatePath("/calidad"); revalidatePath(`/inventario/${assetId}`); redirect(`/inventario/${assetId}?disposed=1`);
}

export async function reactivateAsset(formData: FormData) {
  const { supabase } = await requirePermission("inventory.reactivate");
  const assetId = requiredText(formData, "asset_id");
  const reason = requiredText(formData, "reactivation_reason");
  const { error } = await supabase.rpc("reactivate_asset_atomic", { p_asset_id: assetId, p_reason: reason });
  if (error) redirect(`/inventario/${assetId}?error=reactivate`);
  revalidatePath("/dashboard"); revalidatePath("/inventario"); revalidatePath("/bajas"); revalidatePath("/calidad"); revalidatePath(`/inventario/${assetId}`); redirect(`/inventario/${assetId}?reactivated=1`);
}
