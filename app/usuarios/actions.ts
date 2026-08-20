"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRootAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

const ROOT_EMAIL = "admin@colprovidencia.cl";
const MIN_TEMPORARY_PASSWORD_LENGTH = 10;

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function isRootEmail(email: string | null | undefined) {
  return String(email ?? "").toLowerCase() === ROOT_EMAIL;
}

function authErrorCode(error: { message?: string | null; status?: number } | null | undefined, fallback: string) {
  const message = String(error?.message ?? "").toLowerCase();
  if (message.includes("already registered") || message.includes("already been registered") || message.includes("already exists")) return "email_exists";
  if (message.includes("password")) return "password_policy";
  if (message.includes("rate limit") || error?.status === 429) return "rate_limit";
  return fallback;
}

async function requestOrigin() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (origin) return origin;
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionHost) return `https://${productionHost}`;
  return "http://localhost:3000";
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

async function cleanupFailedUser(admin: NonNullable<ReturnType<typeof createAdminClient>>, userId: string) {
  await admin.from("user_roles").delete().eq("user_id", userId);
  await admin.from("profiles").delete().eq("id", userId);
  await admin.auth.admin.deleteUser(userId, false);
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
    if (temporaryPassword.length < MIN_TEMPORARY_PASSWORD_LENGTH) redirect("/usuarios?error=password_length");
    const { data, error } = await admin.auth.admin.createUser({ email, password: temporaryPassword, email_confirm: true });
    if (error || !data.user) redirect(`/usuarios?error=${authErrorCode(error, "create")}`);
    userId = data.user.id;
  } else {
    const origin = await requestOrigin();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/cambiar-clave?invite=1` });
    if (error || !data.user) redirect(`/usuarios?error=${authErrorCode(error, "invite")}`);
    userId = data.user.id;
  }

  const { error: profileError } = await admin.from("profiles").upsert({ id: userId, email, role: "user", active: true });
  if (profileError) {
    await cleanupFailedUser(admin, userId);
    redirect("/usuarios?error=profile");
  }

  const { error: roleError } = await admin.from("user_roles").upsert({
    user_id: userId,
    role_id: role.id,
    assigned_by: profile.id,
  }, { onConflict: "user_id,role_id" });
  if (roleError) {
    await cleanupFailedUser(admin, userId);
    redirect("/usuarios?error=assign");
  }

  revalidatePath("/usuarios");
  redirect("/usuarios?created=1");
}

export async function assignManagedUserRole(formData: FormData) {
  const { supabase } = await requireRootAdmin();
  const userId = text(formData, "user_id");
  const roleId = text(formData, "role_id");
  const email = text(formData, "email");
  if (!userId || !roleId || isRootEmail(email)) redirect("/usuarios?error=protected");

  const role = await ensureAssignableRole(supabase, roleId);
  if (!role) redirect("/usuarios?error=role");

  const { error } = await supabase.rpc("replace_user_role_atomic", {
    p_user_id: userId,
    p_role_id: role.id,
  });
  if (error) redirect("/usuarios?error=assign");

  revalidatePath("/usuarios");
  redirect("/usuarios?role_updated=1");
}

export async function setManagedUserActive(formData: FormData) {
  const { supabase } = await requireRootAdmin();
  const userId = text(formData, "user_id");
  const email = text(formData, "email");
  const active = text(formData, "active") === "true";
  if (!userId || isRootEmail(email)) redirect("/usuarios?error=protected");

  const { error } = await supabase.from("profiles").update({ active }).eq("id", userId);
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
