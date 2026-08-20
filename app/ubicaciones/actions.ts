"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/require-admin";

function text(formData: FormData, key: string) { const value = String(formData.get(key) ?? "").trim(); return value || null; }

export async function createLocation(formData: FormData) {
  const { supabase } = await requirePermission("locations.manage");
  const name = text(formData, "name");
  if (!name) redirect("/ubicaciones?error=name");
  const { error } = await supabase.from("locations").insert({ name, area: text(formData, "area"), description: text(formData, "description"), active: true });
  if (error) redirect("/ubicaciones?error=create");
  revalidatePath("/ubicaciones"); revalidatePath("/inventario"); redirect("/ubicaciones?created=1");
}

export async function updateLocation(formData: FormData) {
  const { supabase } = await requirePermission("locations.manage");
  const id = text(formData, "location_id"); const name = text(formData, "name");
  if (!id || !name) redirect("/ubicaciones?error=missing");
  const active = String(formData.get("active") ?? "true") === "true";
  const { error } = await supabase.from("locations").update({ name, area: text(formData, "area"), description: text(formData, "description"), active }).eq("id", id);
  if (error) redirect("/ubicaciones?error=update");
  revalidatePath("/ubicaciones"); revalidatePath("/inventario"); redirect("/ubicaciones?updated=1");
}
