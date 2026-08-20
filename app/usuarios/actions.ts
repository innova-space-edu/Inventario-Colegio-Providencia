"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission, requirePermissions } from "@/lib/auth/require-admin";
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

type PermissionContext = Awaited<ReturnType<typeof requirePermission>>;

async function ensureAssignableRole(supabase: PermissionContext["supabase"], roleId: string) {
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
  const { supabase } = await requirePermissions(["users.manage", "users.assign_roles"]);
  const admin = createAdminClient();
  if (!admin) redirect("/usuarios?error=server_key");

  const email = text(formData, "email")?.toLowerCase();
  const roleId = text(formData, "role_id");
  const temporaryPassword = text(formData, "temporary_password");
  if (!email || !roleId || isRootEmail(email)) redirect("/usuarios?error=invalid");

  const role = await ensureAssignableRole(supabase, roleId);
  if (!role) redirect("/usuarios?error=role");

  let userId: string;
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

  const { error: roleError } = await supabase.rpc("replace_user_role_atomic", {
    p_user_id: userId,
    p_role_id: role.id,
  });
  if (roleError) {
    await cleanupFailedUser(admin, userId);
    redirect("/usuarios?error=assign");
  }

  revalidatePath("/usuarios");
  revalidatePath("/dashboard");
  redirect("/usuarios?created=1");
}

export async function assignManagedUserRole(formData: FormData) {
  const { supabase } = await requirePermission("users.assign_roles");
  const userId = text(formData, "user_id");
  const roleId = text(formData, "role_id");
  if (!userId || !roleId) redirect("/usuarios?error=invalid");

  const role = await ensureAssignableRole(supabase, roleId);
  if (!role) redirect("/usuarios?error=role");

  const { error } = await supabase.rpc("replace_user_role_atomic", {
    p_user_id: userId,
    p_role_id: role.id,
  });
  if (error) redirect("/usuarios?error=protected");

  revalidatePath("/usuarios");
  revalidatePath("/dashboard");
  redirect("/usuarios?role_updated=1");
}

export async function setManagedUserActive(formData: FormData) {
  const { supabase } = await requirePermission("users.manage");
  const userId = text(formData, "user_id");
  const active = text(formData, "active") === "true";
  if (!userId) redirect("/usuarios?error=invalid");

  const { error } = await supabase.rpc("set_managed_user_active_atomic", {
    p_user_id: userId,
    p_active: active,
  });
  if (error) redirect("/usuarios?error=protected");

  revalidatePath("/usuarios");
  redirect(`/usuarios?status=${active ? "enabled" : "disabled"}`);
}

export async function deleteManagedUser(formData: FormData) {
  await requirePermission("users.manage");
  const admin = createAdminClient();
  if (!admin) redirect("/usuarios?error=server_key");

  const userId = text(formData, "user_id");
  const confirmation = text(formData, "confirmation");
  if (!userId || !confirmation) redirect("/usuarios?error=delete_confirmation");

  const { data, error: lookupError } = await admin.auth.admin.getUserById(userId);
  const targetEmail = data.user?.email?.toLowerCase() ?? null;
  if (lookupError || !targetEmail) redirect("/usuarios?error=delete");
  if (isRootEmail(targetEmail)) redirect("/usuarios?error=protected");
  if (confirmation.toLowerCase() !== targetEmail) redirect("/usuarios?error=delete_confirmation");

  const { error } = await admin.auth.admin.deleteUser(userId, false);
  if (error) redirect("/usuarios?error=delete");

  revalidatePath("/usuarios");
  revalidatePath("/dashboard");
  redirect("/usuarios?deleted=1");
}
