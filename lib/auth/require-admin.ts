import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AccessProfile = {
  id: string;
  email: string;
  role: "admin" | "user";
  active: boolean;
};

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,role,active")
    .eq("id", userId)
    .maybeSingle();

  if (!profile || !profile.active) {
    redirect("/login?error=unauthorized");
  }

  return { supabase, profile: profile as AccessProfile };
}

export async function getPermissionCodes(supabase: ServerSupabase) {
  const { data, error } = await supabase
    .from("app_permissions")
    .select("code")
    .order("code");

  if (error) return [] as string[];
  return (data ?? []).map((item) => item.code as string);
}

// Compatibilidad con módulos existentes. La autorización fina se resuelve con RLS y permisos.
export async function requireAdmin() {
  return requireUser();
}

export async function requirePermission(permission: string) {
  const context = await requireUser();
  const { data, error } = await context.supabase.rpc("has_permission", {
    p_permission: permission,
  });

  if (error || data !== true) redirect("/dashboard?error=forbidden");
  return context;
}

export async function requireRootAdmin() {
  const context = await requireUser();
  const { data, error } = await context.supabase.rpc("is_root_admin");

  if (error || data !== true) redirect("/dashboard?error=forbidden");
  return context;
}
