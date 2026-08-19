"use client";

export function PrintButton() {
  return <button className="button button-primary print-hide" onClick={() => window.print()} type="button">Imprimir / Guardar PDF</button>;
}
