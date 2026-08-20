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
  const { data, error } = await supabase.rpc("get_my_permission_codes");
  if (error) return [] as string[];

  const rows = (data ?? []) as Array<{ code?: string } | string>;
  return rows
    .map((item) => (typeof item === "string" ? item : item.code ?? ""))
    .filter(Boolean);
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

export async function requirePermissions(permissions: string[]) {
  const context = await requireUser();
  const results = await Promise.all(
    permissions.map((permission) =>
      context.supabase.rpc("has_permission", { p_permission: permission }),
    ),
  );

  if (results.some((result) => result.error || result.data !== true)) {
    redirect("/dashboard?error=forbidden");
  }

  return context;
}

export async function requireRootAdmin() {
  const context = await requireUser();
  const { data, error } = await context.supabase.rpc("is_root_admin");

  if (error || data !== true) redirect("/dashboard?error=forbidden");
  return context;
}
