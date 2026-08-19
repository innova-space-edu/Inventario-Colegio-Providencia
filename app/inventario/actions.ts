"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

function text(formData: FormData, key: string) { const value = String(formData.get(key) ?? "").trim(); return value || null; }
function requiredText(formData: FormData, key: string) { const value = text(formData, key); if (!value) throw new Error(`Missing required field: ${key}`); return value; }
function quantity(formData: FormData) { const value = Number(formData.get("quantity") ?? 1); return Number.isInteger(value) && value > 0 ? value : 1; }

async function saveFamilyDetails(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], assetId: string, familyCode: string, formData: FormData) {
  if (familyCode === "computer") { const { error } = await supabase.from("computer_details").upsert({ asset_id: assetId, memory: text(formData, "memory"), storage: text(formData, "storage"), screen: text(formData, "screen"), keyboard: text(formData, "keyboard"), battery: text(formData, "battery"), charger: text(formData, "charger") }); if (error) throw error; }
  if (familyCode === "projector") { const { error } = await supabase.from("projector_details").upsert({ asset_id: assetId, lumens: text(formData, "lumens"), hdmi: text(formData, "hdmi"), vga: text(formData, "vga") }); if (error) throw error; }
  if (familyCode === "television") { const { error } = await supabase.from("television_details").upsert({ asset_id: assetId, size: text(formData, "size") }); if (error) throw error; }
}

export async function createAsset(formData: FormData) {
  const { supabase, profile } = await requireAdmin();
  const familyId = requiredText(formData, "family_id");
  const { data: family } = await supabase.from("asset_families").select("code").eq("id", familyId).single();
  if (!family) redirect("/inventario/nuevo?error=family");
  const payload = { inventory_code: text(formData, "inventory_code"), family_id: familyId, status_id: text(formData, "status_id"), location_id: text(formData, "location_id"), name: text(formData, "name"), asset_type: text(formData, "asset_type"), brand: text(formData, "brand"), model: text(formData, "model"), serial_number: text(formData, "serial_number"), quantity: quantity(formData), area: text(formData, "area"), observations: text(formData, "observations"), created_by: profile.id, updated_by: profile.id };
  const { data: asset, error } = await supabase.from("assets").insert(payload).select("id").single();
  if (error || !asset) redirect("/inventario/nuevo?error=save");
  await saveFamilyDetails(supabase, asset.id, family.code, formData);
  await supabase.from("asset_history").insert({ asset_id: asset.id, event_type: "created", description: "Activo creado desde la aplicación web.", after_data: payload, actor_id: profile.id });
  revalidatePath("/dashboard"); revalidatePath("/inventario"); revalidatePath("/calidad"); redirect(`/inventario/${asset.id}?created=1`);
}

export async function updateAsset(formData: FormData) {
  const { supabase, profile } = await requireAdmin();
  const assetId = requiredText(formData, "asset_id"); const familyId = requiredText(formData, "family_id");
  const { data: before } = await supabase.from("assets").select("*").eq("id", assetId).single();
  if (!before || before.family_id !== familyId) redirect(`/inventario/${assetId}/editar?error=family`);
  const { data: family } = await supabase.from("asset_families").select("code").eq("id", familyId).single();
  if (!family) redirect(`/inventario/${assetId}/editar?error=family`);
  const payload = { inventory_code: text(formData, "inventory_code"), status_id: text(formData, "status_id"), location_id: text(formData, "location_id"), name: text(formData, "name"), asset_type: text(formData, "asset_type"), brand: text(formData, "brand"), model: text(formData, "model"), serial_number: text(formData, "serial_number"), quantity: quantity(formData), area: text(formData, "area"), observations: text(formData, "observations"), updated_by: profile.id };
  const { error } = await supabase.from("assets").update(payload).eq("id", assetId); if (error) redirect(`/inventario/${assetId}/editar?error=save`);
  await saveFamilyDetails(supabase, assetId, family.code, formData);
  await supabase.from("asset_history").insert({ asset_id: assetId, event_type: "updated", description: "Activo actualizado desde la aplicación web.", before_data: before, after_data: { ...before, ...payload }, actor_id: profile.id });
  revalidatePath("/dashboard"); revalidatePath("/inventario"); revalidatePath("/calidad"); revalidatePath(`/inventario/${assetId}`); redirect(`/inventario/${assetId}?updated=1`);
}

export async function disposeAsset(formData: FormData) {
  const { supabase, profile } = await requireAdmin(); const assetId = requiredText(formData, "asset_id"); const reason = text(formData, "reason"); const observations = text(formData, "disposal_observations"); const approvedBy = text(formData, "approved_by");
  const [{ data: asset }, { data: disposedStatus }] = await Promise.all([supabase.from("assets").select("*").eq("id", assetId).single(), supabase.from("asset_statuses").select("id").eq("code", "disposed").single()]);
  if (!asset || !disposedStatus) redirect(`/inventario/${assetId}?error=dispose`);
  const { error: updateError } = await supabase.from("assets").update({ is_disposed: true, status_id: disposedStatus.id, updated_by: profile.id }).eq("id", assetId); if (updateError) redirect(`/inventario/${assetId}?error=dispose`);
  const { error: disposalError } = await supabase.from("asset_disposals").insert({ asset_id: assetId, reason, observations, approved_by: approvedBy, created_by: profile.id }); if (disposalError) redirect(`/inventario/${assetId}?error=dispose_record`);
  await supabase.from("asset_history").insert({ asset_id: assetId, event_type: "disposed", description: reason || "Activo dado de baja.", before_data: asset, after_data: { ...asset, is_disposed: true, status_id: disposedStatus.id }, actor_id: profile.id });
  revalidatePath("/dashboard"); revalidatePath("/inventario"); revalidatePath("/bajas"); revalidatePath("/calidad"); revalidatePath(`/inventario/${assetId}`); redirect(`/inventario/${assetId}?disposed=1`);
}

export async function reactivateAsset(formData: FormData) {
  const { supabase, profile } = await requireAdmin();
  const assetId = requiredText(formData, "asset_id");
  const reason = requiredText(formData, "reactivation_reason");

  const [{ data: asset }, { data: operationalStatus }] = await Promise.all([
    supabase.from("assets").select("*").eq("id", assetId).single(),
    supabase.from("asset_statuses").select("id").eq("code", "operational").single(),
  ]);

  if (!asset || !asset.is_disposed || !operationalStatus) redirect(`/inventario/${assetId}?error=reactivate`);

  const after = { ...asset, is_disposed: false, status_id: operationalStatus.id, updated_by: profile.id };
  const { error } = await supabase.from("assets").update({
    is_disposed: false,
    status_id: operationalStatus.id,
    updated_by: profile.id,
  }).eq("id", assetId);
  if (error) redirect(`/inventario/${assetId}?error=reactivate`);

  const { error: historyError } = await supabase.from("asset_history").insert({
    asset_id: assetId,
    event_type: "reactivated",
    description: `Reactivado: ${reason}`,
    before_data: asset,
    after_data: after,
    actor_id: profile.id,
  });
  if (historyError) redirect(`/inventario/${assetId}?error=reactivate_history`);

  revalidatePath("/dashboard");
  revalidatePath("/inventario");
  revalidatePath("/bajas");
  revalidatePath("/calidad");
  revalidatePath(`/inventario/${assetId}`);
  redirect(`/inventario/${assetId}?reactivated=1`);
}
