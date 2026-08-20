import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { getPermissionCodes, requireUser } from "@/lib/auth/require-admin";

export async function AppShell({ children }: { children: ReactNode }) {
  const { supabase, profile } = await requireUser();
  const [permissions, rootResult] = await Promise.all([
    getPermissionCodes(supabase),
    supabase.rpc("is_root_admin"),
  ]);

  return (
    <div className="shell">
      <AppSidebar
        email={profile.email}
        isRoot={rootResult.data === true}
        permissions={permissions}
      />
      <main className="main">{children}</main>
    </div>
  );
}
