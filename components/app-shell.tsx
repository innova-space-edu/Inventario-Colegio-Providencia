import Link from "next/link";
import { logout } from "@/app/login/actions";

const modules = [
  ["Dashboard", "/dashboard"],
  ["Inventario general", "/inventario"],
  ["Computadores", "/computadores"],
  ["Impresoras", "/impresoras"],
  ["Proyectores", "/proyectores"],
  ["Audio", "/audio"],
  ["Televisores", "/televisores"],
  ["Muebles", "/muebles"],
  ["Accesorios", "/accesorios"],
  ["Varios", "/varios"],
  ["Bajas", "/bajas"],
  ["Informes", "/informes"],
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">CP</div>
          <div><strong>Colegio Providencia</strong><span>Inventario TI</span></div>
        </div>
        <nav className="nav">
          {modules.map(([label, href], index) => (
            <Link className={index === 0 ? "active" : ""} href={href} key={href}>{label}</Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <form action={logout}><button className="logout-button" type="submit">Cerrar sesión</button></form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
