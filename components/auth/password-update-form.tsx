"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MIN_PASSWORD_LENGTH = 10;

export function PasswordUpdateForm({ embedded = false }: { embedded?: boolean }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function prepareSession() {
      const supabase = createClient();
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (!exchangeError) {
          url.searchParams.delete("code");
          window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
        }
      }

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        setError("El enlace no contiene una sesión válida o ya expiró. Solicita un nuevo enlace de recuperación o invitación.");
      }
      setReady(true);
    }

    prepareSession();
    return () => { cancelled = true; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setBusy(false);
      const message = updateError.message.toLowerCase();
      if (message.includes("password")) setError("Supabase rechazó la contraseña. Usa una contraseña más fuerte y evita contraseñas conocidas o comprometidas.");
      else setError("No fue posible actualizar la contraseña. Solicita un nuevo enlace e inténtalo otra vez.");
      return;
    }

    await supabase.auth.signOut();
    window.location.assign("/login?password=updated");
  }

  const content = (
    <>
      {!embedded ? <><div className="brand-mark">CP</div><h1>Definir nueva contraseña</h1><p>Establece una contraseña segura para tu cuenta del Inventario Colegio Providencia.</p></> : null}
      {error ? <div className="error-box">{error}</div> : null}
      {!ready ? <div className="info-box">Validando el enlace de acceso…</div> : null}
      <form onSubmit={submit}>
        <div className="form-field">
          <label htmlFor="new-password">Nueva contraseña</label>
          <input id="new-password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} value={password} onChange={(event) => setPassword(event.target.value)} required />
        </div>
        <div className="form-field">
          <label htmlFor="confirm-password">Repetir contraseña</label>
          <input id="confirm-password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
        </div>
        <button className={embedded ? "button button-primary" : "primary-button"} disabled={busy || !ready || Boolean(error && error.includes("sesión válida"))} type="submit">
          {busy ? "Guardando…" : "Guardar nueva contraseña"}
        </button>
      </form>
      {!embedded ? <p className="auth-note"><Link className="table-link" href="/login">Volver al inicio de sesión</Link></p> : null}
    </>
  );

  if (embedded) return <div>{content}</div>;
  return <main className="auth-page"><section className="auth-card">{content}</section></main>;
}
