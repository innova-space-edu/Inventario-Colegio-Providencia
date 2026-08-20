"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/app/login/actions";
import { BrandLogo } from "@/components/brand-logo";
import styles from "./app-sidebar.module.css";

type NavItem = {
  label: string;
  href: string;
  permission?: string;
  rootOnly?: boolean;
};

const topModules: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Inventario general", href: "/inventario", permission: "inventory.view" },
  { label: "Calidad de datos", href: "/calidad", permission: "quality.view" },
];

const familyModules: NavItem[] = [
  { label: "Computadores", href: "/computadores", permission: "inventory.view" },
  { label: "Impresoras", href: "/impresoras", permission: "inventory.view" },
  { label: "Proyectores", href: "/proyectores", permission: "inventory.view" },
  { label: "Audio", href: "/audio", permission: "inventory.view" },
  { label: "Televisores", href: "/televisores", permission: "inventory.view" },
  { label: "Muebles", href: "/muebles", permission: "inventory.view" },
  { label: "Accesorios", href: "/accesorios", permission: "inventory.view" },
  { label: "Varios", href: "/varios", permission: "inventory.view" },
];

const bottomModules: NavItem[] = [
  { label: "Bajas", href: "/bajas", permission: "inventory.view" },
  { label: "Ubicaciones", href: "/ubicaciones", permission: "locations.view" },
  { label: "Informes", href: "/informes", permission: "reports.view" },
  { label: "Auditoría", href: "/auditoria", permission: "audit.view" },
  { label: "Importación Access", href: "/importaciones", permission: "imports.view" },
  { label: "Usuarios", href: "/usuarios", rootOnly: true },
  { label: "Roles y permisos", href: "/roles", rootOnly: true },
  { label: "Configuración", href: "/configuracion", permission: "system.view" },
];

const accountModule: NavItem = { label: "Mi cuenta", href: "/mi-cuenta" };

function isActive(pathname: string, href: string) {
  return href === "/dashboard"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

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
  const canSee = (item: NavItem) => {
    if (item.rootOnly) return isRoot;
    if (!item.permission) return true;
    return permissionSet.has(item.permission);
  };

  const visibleTop = topModules.filter(canSee);
  const visibleFamilies = familyModules.filter(canSee);
  const visibleBottom = bottomModules.filter(canSee);
  const familyRouteActive = visibleFamilies.some((item) => isActive(pathname, item.href));
  const [familiesOpen, setFamiliesOpen] = useState(familyRouteActive);

  useEffect(() => {
    if (familyRouteActive) setFamiliesOpen(true);
  }, [familyRouteActive]);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <BrandLogo />
        <div><strong>Colegio Providencia</strong><span>Inventario TI</span></div>
      </div>
      <nav className="nav">
        {visibleTop.map((item) => (
          <Link className={isActive(pathname, item.href) ? "active" : ""} href={item.href} key={item.href}>{item.label}</Link>
        ))}

        {visibleFamilies.length ? (
          <div className={styles.familyGroup}>
            <button
              aria-expanded={familiesOpen}
              className={`${styles.familyButton} ${familyRouteActive ? styles.familyButtonActive : ""}`}
              onClick={() => setFamiliesOpen((open) => !open)}
              type="button"
            >
              <span>Familias tecnológicas</span>
              <span className={`${styles.chevron} ${familiesOpen ? styles.chevronOpen : ""}`} aria-hidden="true">⌄</span>
            </button>
            {familiesOpen ? (
              <div className={styles.familyList}>
                {visibleFamilies.map((item) => (
                  <Link
                    className={isActive(pathname, item.href) ? styles.familyActive : ""}
                    href={item.href}
                    key={item.href}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {visibleBottom.map((item) => (
          <Link className={isActive(pathname, item.href) ? "active" : ""} href={item.href} key={item.href}>{item.label}</Link>
        ))}

        <Link className={isActive(pathname, accountModule.href) ? "active" : ""} href={accountModule.href}>{accountModule.label}</Link>
        <form action={logout} className={styles.logoutForm}>
          <button className={styles.logoutNavButton} type="submit">Cerrar sesión</button>
        </form>
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-user"><span>{isRoot ? "Administrador raíz" : "Usuario autorizado"}</span><strong>{email}</strong></div>
      </div>
    </aside>
  );
}
