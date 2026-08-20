"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/require-admin";

function text(formData: FormData, key: string) { const value = String(formData.get(key) ?? "").trim(); return value || null; }
function requiredText(formData: FormData, key: string) { const value = text(formData, key); if (!value) throw new Error(`Missing required field: ${key}`); return value; }
function quantity(formData: FormData) { const value = Number(formData.get("quantity") ?? 1); return Number.isInteger(value) && value > 0 ? value : 1; }
function safeReturnTo(formData: FormData) { const value = text(formData, "return_to"); return value && value.startsWith("/") && !value.startsWith("//") ? value : "/inventario"; }
function redirectWithParams(path: string, params: Record<string, string | number>) {
  const url = new URL(path, "http://inventario.local");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  redirect(`${url.pathname}${url.search ? url.search : ""}`);
}

function commonPayload(formData: FormData) {
  return {
    inventory_code: text(formData, "inventory_code"),
    status_id: text(formData, "status_id"),
    location_id: text(formData, "location_id"),
    name: text(formData, "name"),
    asset_type: text(formData, "asset_type"),
    brand: text(formData, "brand"),
    model: text(formData, "model"),
    serial_number: text(formData, "serial_number"),
    quantity: quantity(formData),
    area: text(formData, "area"),
    responsible_name: text(formData, "responsible_name"),
    observations: text(formData, "observations"),
  };
}

function detailPayload(formData: FormData) {
  return {
    memory: text(formData, "memory"),
    storage: text(formData, "storage"),
    screen: text(formData, "screen"),
    keyboard: text(formData, "keyboard"),
    battery: text(formData, "battery"),
    charger: text(formData, "charger"),
    screen_size: text(formData, "screen_size"),
    operating_system: text(formData, "operating_system"),
    resolution: text(formData, "resolution"),
    touch_enabled: text(formData, "touch_enabled"),
    touch_points: text(formData, "touch_points"),
    lumens: text(formData, "lumens"),
    hdmi: text(formData, "hdmi"),
    vga: text(formData, "vga"),
    size: text(formData, "size"),
  };
}

export async function createAsset(formData: FormData) {
  const { supabase } = await requirePermission("inventory.create");
  const familyId = requiredText(formData, "family_id");
  const { data: assetId, error } = await supabase.rpc("create_asset_atomic", { p_asset: { ...commonPayload(formData), family_id: familyId }, p_details: detailPayload(formData) });
  if (error || !assetId) redirect("/inventario/nuevo?error=save");
  revalidatePath("/dashboard"); revalidatePath("/inventario"); revalidatePath("/calidad"); revalidatePath("/ubicaciones"); redirect(`/inventario/${assetId}?created=1`);
}

export async function updateAsset(formData: FormData) {
  const { supabase } = await requirePermission("inventory.edit");
  const assetId = requiredText(formData, "asset_id");
  const { error } = await supabase.rpc("update_asset_atomic", { p_asset_id: assetId, p_asset: commonPayload(formData), p_details: detailPayload(formData) });
  if (error) redirect(`/inventario/${assetId}/editar?error=save`);
  revalidatePath("/dashboard"); revalidatePath("/inventario"); revalidatePath("/calidad"); revalidatePath("/ubicaciones"); revalidatePath(`/inventario/${assetId}`); revalidatePath(`/qr/${assetId}`); redirect(`/inventario/${assetId}?updated=1`);
}

export async function disposeAsset(formData: FormData) {
  const { supabase } = await requirePermission("inventory.dispose");
  const assetId = requiredText(formData, "asset_id");
  const reason = requiredText(formData, "reason");
  const { error } = await supabase.rpc("dispose_asset_atomic", { p_asset_id: assetId, p_reason: reason, p_observations: text(formData, "disposal_observations"), p_approved_by: text(formData, "approved_by") });
  if (error) redirect(`/inventario/${assetId}?error=dispose`);
  revalidatePath("/dashboard"); revalidatePath("/inventario"); revalidatePath("/bajas"); revalidatePath("/calidad"); revalidatePath("/ubicaciones"); revalidatePath(`/inventario/${assetId}`); revalidatePath(`/qr/${assetId}`); redirect(`/inventario/${assetId}?disposed=1`);
}

export async function reactivateAsset(formData: FormData) {
  const { supabase } = await requirePermission("inventory.reactivate");
  const assetId = requiredText(formData, "asset_id");
  const reason = requiredText(formData, "reactivation_reason");
  const { error } = await supabase.rpc("reactivate_asset_atomic", { p_asset_id: assetId, p_reason: reason });
  if (error) redirect(`/inventario/${assetId}?error=reactivate`);
  revalidatePath("/dashboard"); revalidatePath("/inventario"); revalidatePath("/bajas"); revalidatePath("/calidad"); revalidatePath("/ubicaciones"); revalidatePath(`/inventario/${assetId}`); revalidatePath(`/qr/${assetId}`); redirect(`/inventario/${assetId}?reactivated=1`);
}

export async function bulkSetAssetLifecycle(formData: FormData) {
  const returnTo = safeReturnTo(formData);
  const action = text(formData, "bulk_action");
  if (action !== "dispose" && action !== "reactivate") redirectWithParams(returnTo, { error: "bulk_action" });

  const reason = text(formData, "bulk_reason");
  if (!reason) redirectWithParams(returnTo, { error: "bulk_reason" });

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const assetIds = [...new Set(formData.getAll("asset_ids").map((value) => String(value)).filter((value) => uuidPattern.test(value)))].slice(0, 100);
  if (!assetIds.length) redirectWithParams(returnTo, { error: "bulk_selection" });

  const permission = action === "dispose" ? "inventory.dispose" : "inventory.reactivate";
  const { supabase, profile } = await requirePermission(permission);
  const { data, error } = await supabase.rpc("set_assets_lifecycle_bulk_atomic", {
    p_asset_ids: assetIds,
    p_action: action,
    p_reason: reason,
    p_observations: null,
    p_approved_by: action === "dispose" ? profile.email : null,
  });

  if (error) redirectWithParams(returnTo, { error: "bulk_update" });

  const result = (data ?? {}) as { changed?: number; skipped?: number; selected?: number };
  revalidatePath("/dashboard");
  revalidatePath("/inventario");
  revalidatePath("/bajas");
  revalidatePath("/calidad");
  revalidatePath("/ubicaciones");
  for (const assetId of assetIds) {
    revalidatePath(`/inventario/${assetId}`);
    revalidatePath(`/qr/${assetId}`);
  }

  redirectWithParams(returnTo, {
    bulk: action === "dispose" ? "disposed" : "reactivated",
    bulk_count: result.changed ?? 0,
    bulk_skipped: result.skipped ?? 0,
  });
}
