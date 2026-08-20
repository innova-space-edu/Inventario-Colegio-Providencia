"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";

const modules = [
  ["Dashboard", "/dashboard"],
  ["Inventario general", "/inventario"],
  ["Calidad de datos", "/calidad"],
  ["Computadores", "/computadores"],
  ["Impresoras", "/impresoras"],
  ["Proyectores", "/proyectores"],
  ["Audio", "/audio"],
  ["Televisores", "/televisores"],
  ["Muebles", "/muebles"],
  ["Accesorios", "/accesorios"],
  ["Varios", "/varios"],
  ["Bajas", "/bajas"],
  ["Ubicaciones", "/ubicaciones"],
  ["Informes", "/informes"],
  ["Auditoría", "/auditoria"],
  ["Importación Access", "/importaciones"],
  ["Usuarios", "/usuarios"],
  ["Roles y permisos", "/roles"],
  ["Configuración", "/configuracion"],
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div className="shell"><aside className="sidebar"><div className="sidebar-brand"><div className="brand-mark">CP</div><div><strong>Colegio Providencia</strong><span>Inventario TI</span></div></div><nav className="nav">{modules.map(([label, href]) => { const active = href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`); return <Link className={active ? "active" : ""} href={href} key={href}>{label}</Link>; })}</nav><div className="sidebar-footer"><form action={logout}><button className="logout-button" type="submit">Cerrar sesión</button></form></div></aside><main className="main">{children}</main></div>;
}
