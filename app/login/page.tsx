import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { login } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; password?: string }>;
};

const messages: Record<string, string> = {
  missing: "Ingresa correo y contraseña.",
  invalid: "Correo o contraseña incorrectos.",
  unauthorized: "La cuenta está desactivada o no está autorizada para ingresar.",
  no_role: "La cuenta existe, pero todavía no tiene un rol activo asignado.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = params.error ? messages[params.error] : undefined;
  const passwordUpdated = params.password === "updated";

  return (
    <main className="auth-page">
      <section className="auth-card">
        <BrandLogo variant="login" />
        <h1>Inventario Tecnológico</h1>
        <p>Colegio Providencia · Acceso autorizado</p>

        {error ? <div className="error-box">{error}</div> : null}
        {passwordUpdated ? <div className="info-box">Contraseña actualizada correctamente. Ya puedes iniciar sesión.</div> : null}

        <form action={login}>
          <div className="form-field">
            <label htmlFor="email">Correo electrónico</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="form-field">
            <label htmlFor="password">Contraseña</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="primary-button" type="submit">Iniciar sesión</button>
        </form>

        <p className="auth-note"><Link className="table-link" href="/recuperar-clave">¿Olvidaste tu contraseña?</Link></p>
        <p className="auth-note">No existe registro público. Las cuentas y sus roles se administran desde la propia plataforma.</p>
      </section>
    </main>
  );
}
