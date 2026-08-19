import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inventario TI | Colegio Providencia",
  description: "Sistema de inventario tecnológico del Colegio Providencia",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
