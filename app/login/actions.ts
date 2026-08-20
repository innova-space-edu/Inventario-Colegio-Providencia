"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) redirect("/login?error=missing");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=invalid");

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login?error=invalid");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,role,active")
    .eq("id", userId)
    .maybeSingle();

  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    redirect("/login?error=unauthorized");
  }

  const { data: isRoot } = await supabase.rpc("is_root_admin");
  if (isRoot !== true) {
    const { data: assignedRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role:app_roles!inner(id,active)")
      .eq("user_id", userId)
      .eq("app_roles.active", true)
      .limit(1);

    if (rolesError || !assignedRoles?.length) {
      await supabase.auth.signOut();
      redirect("/login?error=no_role");
    }
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
