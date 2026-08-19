import { login } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

const messages: Record<string, string> = {
  missing: "Ingresa correo y contraseña.",
  invalid: "Correo o contraseña incorrectos.",
  unauthorized: "La cuenta no está autorizada para administrar este inventario.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = params.error ? messages[params.error] : undefined;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark">CP</div>
        <h1>Inventario Tecnológico</h1>
        <p>Colegio Providencia · Acceso administrativo</p>

        {error ? <div className="error-box">{error}</div> : null}

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

        <p className="auth-note">No existe registro público. Las cuentas se administran exclusivamente desde Supabase.</p>
      </section>
    </main>
  );
}
