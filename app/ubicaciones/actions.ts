"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/require-admin";

function text(formData: FormData, key: string) { const value = String(formData.get(key) ?? "").trim(); return value || null; }
function locationCategory(formData: FormData) {
  const value = String(formData.get("category") ?? "legacy");
  return ["classroom", "office", "dependency", "legacy"].includes(value) ? value : "legacy";
}
function displayOrder(formData: FormData) { const value = Number(formData.get("display_order") ?? 999); return Number.isInteger(value) && value >= 0 ? value : 999; }
function defaultArea(category: string) {
  if (category === "classroom") return "Salas de clases";
  if (category === "office") return "Oficinas";
  if (category === "dependency") return "Dependencias";
  return null;
}

export async function createLocation(formData: FormData) {
  const { supabase } = await requirePermission("locations.manage");
  const name = text(formData, "name");
  if (!name) redirect("/ubicaciones?error=name");
  const category = locationCategory(formData);
  const { error } = await supabase.from("locations").insert({
    name,
    area: text(formData, "area") ?? defaultArea(category),
    description: text(formData, "description"),
    active: true,
    category,
    display_order: displayOrder(formData),
    selectable: category !== "legacy",
  });
  if (error) redirect("/ubicaciones?error=create");
  revalidatePath("/ubicaciones"); revalidatePath("/inventario"); redirect(`/ubicaciones?tipo=${category}&created=1`);
}

export async function updateLocation(formData: FormData) {
  const { supabase } = await requirePermission("locations.manage");
  const id = text(formData, "location_id"); const name = text(formData, "name");
  if (!id || !name) redirect("/ubicaciones?error=missing");
  const active = String(formData.get("active") ?? "true") === "true";
  const category = locationCategory(formData);
  const selectable = category === "legacy" ? false : String(formData.get("selectable") ?? "true") === "true";
  const { error } = await supabase.from("locations").update({
    name,
    area: text(formData, "area") ?? defaultArea(category),
    description: text(formData, "description"),
    active,
    category,
    display_order: displayOrder(formData),
    selectable,
  }).eq("id", id);
  if (error) redirect("/ubicaciones?error=update");
  revalidatePath("/ubicaciones"); revalidatePath(`/ubicaciones/${id}`); revalidatePath("/inventario"); redirect(`/ubicaciones?tipo=${category}&updated=1`);
}

export async function deleteLocation(formData: FormData) {
  const { supabase } = await requirePermission("locations.manage");
  const id = text(formData, "location_id");
  if (!id) redirect("/ubicaciones?error=missing");

  const { data: location } = await supabase.from("locations").select("category").eq("id", id).maybeSingle();
  if (!location) redirect("/ubicaciones?error=not_found");

  const { count, error: countError } = await supabase.from("assets").select("id", { count: "exact", head: true }).eq("location_id", id);
  if (countError) redirect(`/ubicaciones?tipo=${location.category}&error=delete_check`);
  if ((count ?? 0) > 0) redirect(`/ubicaciones?tipo=${location.category}&error=in_use`);

  const { error } = await supabase.from("locations").delete().eq("id", id);
  if (error) redirect(`/ubicaciones?tipo=${location.category}&error=delete`);

  revalidatePath("/ubicaciones"); revalidatePath("/inventario"); redirect(`/ubicaciones?tipo=${location.category}&deleted=1`);
}
