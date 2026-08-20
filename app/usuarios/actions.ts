"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRootAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

const ROOT_EMAIL = "admin@colprovidencia.cl";

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function isRootEmail(email: string | null | undefined) {
  return String(email ?? "").toLowerCase() === ROOT_EMAIL;
}

async function ensureAssignableRole(supabase: Awaited<ReturnType<typeof requireRootAdmin>>["supabase"], roleId: string) {
  const { data: role } = await supabase
    .from("app_roles")
    .select("id,code,name,active")
    .eq("id", roleId)
    .eq("active", true)
    .maybeSingle();

  if (!role || role.code === "super_admin") return null;
  return role;
}

export async function createManagedUser(formData: FormData) {
  const { supabase, profile } = await requireRootAdmin();
  const admin = createAdminClient();
  if (!admin) redirect("/usuarios?error=server_key");

  const email = text(formData, "email")?.toLowerCase();
  const roleId = text(formData, "role_id");
  const temporaryPassword = text(formData, "temporary_password");
  if (!email || !roleId || isRootEmail(email)) redirect("/usuarios?error=invalid");

  const role = await ensureAssignableRole(supabase, roleId);
  if (!role) redirect("/usuarios?error=role");

  let userId: string | undefined;
  if (temporaryPassword) {
    if (temporaryPassword.length < 10) redirect("/usuarios?error=password");
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
    });
    if (error || !data.user) redirect("/usuarios?error=create");
    userId = data.user.id;
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
    if (error || !data.user) redirect("/usuarios?error=invite");
    userId = data.user.id;
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    email,
    role: "user",
    active: true,
  });
  if (profileError) redirect("/usuarios?error=profile");

  const { error: roleError } = await admin.from("user_roles").insert({
    user_id: userId,
    role_id: role.id,
    assigned_by: profile.id,
  });
  if (roleError) redirect("/usuarios?error=assign");

  revalidatePath("/usuarios");
  redirect("/usuarios?created=1");
}

export async function assignManagedUserRole(formData: FormData) {
  const { supabase, profile } = await requireRootAdmin();
  const admin = createAdminClient();
  if (!admin) redirect("/usuarios?error=server_key");

  const userId = text(formData, "user_id");
  const roleId = text(formData, "role_id");
  const email = text(formData, "email");
  if (!userId || !roleId || isRootEmail(email)) redirect("/usuarios?error=protected");

  const role = await ensureAssignableRole(supabase, roleId);
  if (!role) redirect("/usuarios?error=role");

  const { error: deleteError } = await admin.from("user_roles").delete().eq("user_id", userId);
  if (deleteError) redirect("/usuarios?error=assign");

  const { error: insertError } = await admin.from("user_roles").insert({
    user_id: userId,
    role_id: role.id,
    assigned_by: profile.id,
  });
  if (insertError) redirect("/usuarios?error=assign");

  revalidatePath("/usuarios");
  redirect("/usuarios?role_updated=1");
}

export async function setManagedUserActive(formData: FormData) {
  await requireRootAdmin();
  const admin = createAdminClient();
  if (!admin) redirect("/usuarios?error=server_key");

  const userId = text(formData, "user_id");
  const email = text(formData, "email");
  const active = text(formData, "active") === "true";
  if (!userId || isRootEmail(email)) redirect("/usuarios?error=protected");

  const { error } = await admin.from("profiles").update({ active }).eq("id", userId);
  if (error) redirect("/usuarios?error=status");

  revalidatePath("/usuarios");
  redirect(`/usuarios?status=${active ? "enabled" : "disabled"}`);
}

export async function deleteManagedUser(formData: FormData) {
  await requireRootAdmin();
  const admin = createAdminClient();
  if (!admin) redirect("/usuarios?error=server_key");

  const userId = text(formData, "user_id");
  const email = text(formData, "email");
  const confirmation = text(formData, "confirmation");
  if (!userId || !email || isRootEmail(email) || confirmation?.toLowerCase() !== email.toLowerCase()) {
    redirect("/usuarios?error=delete_confirmation");
  }

  const { error } = await admin.auth.admin.deleteUser(userId, false);
  if (error) redirect("/usuarios?error=delete");

  revalidatePath("/usuarios");
  redirect("/usuarios?deleted=1");
}
