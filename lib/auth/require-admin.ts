import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,role,active")
    .eq("id", userId)
    .maybeSingle();

  if (!profile || profile.role !== "admin" || !profile.active) {
    redirect("/login?error=unauthorized");
  }

  return { supabase, profile };
}
