"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

export async function reviewLegacyImport(formData: FormData) {
  const { supabase, profile } = await requireAdmin();
  const id = text(formData, "legacy_id");
  const nextStatus = text(formData, "next_status");
  const notes = text(formData, "review_notes");

  if (!id || !nextStatus || !["pending", "ignored"].includes(nextStatus)) {
    redirect("/importaciones/revision?error=invalid");
  }

  if (nextStatus === "ignored" && !notes) {
    redirect("/importaciones/revision?error=notes");
  }

  const { data: current } = await supabase
    .from("legacy_imports")
    .select("id,migration_status")
    .eq("id", id)
    .maybeSingle();

  if (!current || current.migration_status === "migrated") {
    redirect("/importaciones/revision?error=locked");
  }

  const { error } = await supabase
    .from("legacy_imports")
    .update({
      migration_status: nextStatus,
      review_notes: notes,
      reviewed_at: new Date().toISOString(),
      reviewed_by: profile.id,
      error_message: nextStatus === "pending" ? null : undefined,
    })
    .eq("id", id);

  if (error) redirect("/importaciones/revision?error=save");

  revalidatePath("/importaciones");
  revalidatePath("/importaciones/revision");
  redirect(`/importaciones/revision?status=${nextStatus}&reviewed=1`);
}
