"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/require-admin";

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

export async function reconcileLegacyDisposal(formData: FormData) {
  const { supabase } = await requirePermission("imports.manage");
  const stageId = Number(formData.get("stage_id"));
  const assetId = text(formData, "asset_id");
  const reason = text(formData, "reason");
  const observations = text(formData, "observations");
  const approvedBy = text(formData, "approved_by");
  const disposalDate = text(formData, "disposal_date");

  if (!Number.isInteger(stageId) || stageId <= 0 || !assetId || !reason) {
    redirect(`/importaciones/bajas/${Number.isFinite(stageId) ? stageId : ""}?error=invalid`);
  }

  const { error } = await supabase.rpc("reconcile_legacy_disposal_atomic", {
    p_stage_id: stageId,
    p_asset_id: assetId,
    p_reason: reason,
    p_observations: observations,
    p_approved_by: approvedBy,
    p_disposal_date: disposalDate || null,
  });

  if (error) redirect(`/importaciones/bajas/${stageId}?error=reconcile`);

  revalidatePath("/dashboard");
  revalidatePath("/inventario");
  revalidatePath("/bajas");
  revalidatePath("/calidad");
  revalidatePath("/importaciones");
  revalidatePath("/importaciones/revision");
  revalidatePath("/importaciones/bajas");
  redirect("/importaciones/bajas?reconciled=1");
}
