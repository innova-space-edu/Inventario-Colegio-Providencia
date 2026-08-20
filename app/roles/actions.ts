"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRootAdmin } from "@/lib/auth/require-admin";

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function roleCode(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
}

export async function createRole(formData: FormData) {
  const { supabase, profile } = await requireRootAdmin();
  const name = text(formData, "name");
  const description = text(formData, "description");
  const code = roleCode(text(formData, "code") || name || "");
  if (!name || !code || ["super_admin", "admin"].includes(code)) redirect("/roles?error=invalid");

  const { error } = await supabase.from("app_roles").insert({
    code,
    name,
    description,
    is_system: false,
    active: true,
    created_by: profile.id,
  });
  if (error) redirect("/roles?error=create");

  revalidatePath("/roles");
  redirect("/roles?created=1");
}

export async function updateRoleMetadata(formData: FormData) {
  const { supabase } = await requireRootAdmin();
  const roleId = text(formData, "role_id");
  const name = text(formData, "name");
  const description = text(formData, "description");
  const active = text(formData, "active") === "true";
  if (!roleId || !name) redirect("/roles?error=invalid");

  const { data: role } = await supabase.from("app_roles").select("code").eq("id", roleId).maybeSingle();
  if (!role || role.code === "super_admin") redirect("/roles?error=protected");

  const { error } = await supabase.from("app_roles").update({ name, description, active, updated_at: new Date().toISOString() }).eq("id", roleId);
  if (error) redirect("/roles?error=update");
  revalidatePath("/roles");
  revalidatePath("/usuarios");
  redirect("/roles?updated=1");
}

export async function updateRolePermissions(formData: FormData) {
  const { supabase } = await requireRootAdmin();
  const roleId = text(formData, "role_id");
  if (!roleId) redirect("/roles?error=invalid");

  const { data: role } = await supabase.from("app_roles").select("code").eq("id", roleId).maybeSingle();
  if (!role || role.code === "super_admin") redirect("/roles?error=protected");

  const requested = [...new Set(formData.getAll("permissions").map((value) => String(value)))];
  const { data: validPermissions } = await supabase.from("app_permissions").select("code").in("code", requested.length ? requested : ["__none__"]);
  const valid = new Set((validPermissions ?? []).map((permission) => permission.code));
  const permissions = requested.filter((permission) => valid.has(permission));

  const { error: deleteError } = await supabase.from("role_permissions").delete().eq("role_id", roleId);
  if (deleteError) redirect("/roles?error=permissions");

  if (permissions.length) {
    const { error: insertError } = await supabase.from("role_permissions").insert(permissions.map((permission_code) => ({ role_id: roleId, permission_code })));
    if (insertError) redirect("/roles?error=permissions");
  }

  revalidatePath("/roles");
  redirect("/roles?permissions_updated=1");
}

export async function deleteRole(formData: FormData) {
  const { supabase } = await requireRootAdmin();
  const roleId = text(formData, "role_id");
  if (!roleId) redirect("/roles?error=invalid");

  const { data: role } = await supabase.from("app_roles").select("is_system,code").eq("id", roleId).maybeSingle();
  if (!role || role.is_system || role.code === "super_admin") redirect("/roles?error=protected");

  const { count } = await supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role_id", roleId);
  if ((count ?? 0) > 0) redirect("/roles?error=in_use");

  const { error } = await supabase.from("app_roles").delete().eq("id", roleId);
  if (error) redirect("/roles?error=delete");

  revalidatePath("/roles");
  redirect("/roles?deleted=1");
}
