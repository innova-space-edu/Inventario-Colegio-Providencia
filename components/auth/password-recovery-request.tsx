"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function PasswordRecoveryRequest() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/cambiar-clave")}`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo,
    });

    setBusy(false);
    if (resetError) {
      const message = resetError.message.toLowerCase();
      if (message.includes("rate limit")) setError("Se alcanzó temporalmente el límite de correos. Intenta nuevamente en unos minutos.");
      else setError("No fue posible enviar el correo de recuperación. Intenta nuevamente.");
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark">CP</div>
          <h1>Revisa tu correo</h1>
          <p>Si la cuenta existe, recibirás un enlace para definir una nueva contraseña.</p>
          <div className="info-box">Por seguridad no confirmamos si un correo está o no registrado.</div>
          <p className="auth-note"><Link className="table-link" href="/login">Volver al inicio de sesión</Link></p>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark">CP</div>
        <h1>Recuperar contraseña</h1>
        <p>Ingresa el correo asociado a tu cuenta del Inventario Colegio Providencia.</p>
        {error ? <div className="error-box">{error}</div> : null}
        <form onSubmit={submit}>
          <div className="form-field">
            <label htmlFor="recovery-email">Correo electrónico</label>
            <input
              id="recovery-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Enviando…" : "Enviar enlace de recuperación"}
          </button>
        </form>
        <p className="auth-note"><Link className="table-link" href="/login">Volver al inicio de sesión</Link></p>
      </section>
    </main>
  );
}
