import { AppShell } from "@/components/app-shell";
import { PasswordUpdateForm } from "@/components/auth/password-update-form";
import { requireUser } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function MyAccountPage() {
  const { profile } = await requireUser();

  return (
    <AppShell>
      <header className="topbar">
        <div><h1>Mi cuenta</h1><p>Administra tu acceso personal al Inventario Colegio Providencia.</p></div>
        <span className="badge">{profile.email}</span>
      </header>
      <section className="panel panel-flush">
        <div className="panel-heading"><div><h2>Cambiar contraseña</h2><p className="muted">Al guardar una nueva contraseña se cerrará tu sesión y deberás volver a ingresar.</p></div></div>
        <PasswordUpdateForm embedded />
      </section>
    </AppShell>
  );
}
