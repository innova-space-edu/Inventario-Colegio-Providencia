"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";

type NavItem = {
  label: string;
  href: string;
  permission?: string;
  rootOnly?: boolean;
};

const modules: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Inventario general", href: "/inventario", permission: "inventory.view" },
  { label: "Calidad de datos", href: "/calidad", permission: "quality.view" },
  { label: "Computadores", href: "/computadores", permission: "inventory.view" },
  { label: "Impresoras", href: "/impresoras", permission: "inventory.view" },
  { label: "Proyectores", href: "/proyectores", permission: "inventory.view" },
  { label: "Audio", href: "/audio", permission: "inventory.view" },
  { label: "Televisores", href: "/televisores", permission: "inventory.view" },
  { label: "Muebles", href: "/muebles", permission: "inventory.view" },
  { label: "Accesorios", href: "/accesorios", permission: "inventory.view" },
  { label: "Varios", href: "/varios", permission: "inventory.view" },
  { label: "Bajas", href: "/bajas", permission: "inventory.view" },
  { label: "Ubicaciones", href: "/ubicaciones", permission: "locations.view" },
  { label: "Informes", href: "/informes", permission: "reports.view" },
  { label: "Auditoría", href: "/auditoria", permission: "audit.view" },
  { label: "Importación Access", href: "/importaciones", permission: "imports.view" },
  { label: "Usuarios", href: "/usuarios", rootOnly: true },
  { label: "Roles y permisos", href: "/roles", rootOnly: true },
  { label: "Configuración", href: "/configuracion", permission: "system.view" },
];

export function AppSidebar({
  permissions,
  isRoot,
  email,
}: {
  permissions: string[];
  isRoot: boolean;
  email: string;
}) {
  const pathname = usePathname();
  const permissionSet = new Set(permissions);
  const visibleModules = modules.filter((item) => {
    if (item.rootOnly) return isRoot;
    if (!item.permission) return true;
    return permissionSet.has(item.permission);
  });

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">CP</div>
        <div><strong>Colegio Providencia</strong><span>Inventario TI</span></div>
      </div>
      <nav className="nav">
        {visibleModules.map((item) => {
          const active = item.href === "/dashboard"
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return <Link className={active ? "active" : ""} href={item.href} key={item.href}>{item.label}</Link>;
        })}
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-user"><span>{isRoot ? "Administrador raíz" : "Usuario autorizado"}</span><strong>{email}</strong></div>
        <form action={logout}><button className="logout-button" type="submit">Cerrar sesión</button></form>
      </div>
    </aside>
  );
}
