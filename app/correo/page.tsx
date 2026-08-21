import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmailComposer } from "@/components/mail/email-composer";
import { requireUser } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function CorreoPage() {
  const { profile } = await requireUser();

  return (
    <AppShell>
      <header className="topbar">
        <div>
          <h1>Correo</h1>
          <p>Redacta y envía mensajes desde el inventario del Colegio Providencia.</p>
        </div>
        <div className="header-actions">
          <Link className="button button-ghost" href="/dashboard">Volver al panel</Link>
          <span className="badge">Cuenta: {profile.email}</span>
        </div>
      </header>

      <EmailComposer accessEmail={profile.email} />
    </AppShell>
  );
}
