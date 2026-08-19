import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Relation<T> = T | T[] | null;
type ExportRow = {
  inventory_code: string | null;
  name: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  quantity: number;
  area: string | null;
  observations: string | null;
  is_disposed: boolean;
  created_at: string;
  updated_at: string;
  family: Relation<{ name: string }>;
  status: Relation<{ name: string }>;
  location: Relation<{ name: string }>;
};

function relationOne<T>(value: Relation<T>): T | null { return Array.isArray(value) ? value[0] ?? null : value; }
function safeCell(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  const neutralized = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: claimData } = await supabase.auth.getClaims();
  const userId = claimData?.claims?.sub;
  if (!userId) return new Response("No autenticado", { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role,active").eq("id", userId).maybeSingle();
  if (!profile || profile.role !== "admin" || !profile.active) return new Response("Sin autorización", { status: 403 });

  const scope = request.nextUrl.searchParams.get("scope") || "all";
  const rows: ExportRow[] = [];
  const chunkSize = 1000;
  let offset = 0;

  while (true) {
    let query = supabase
      .from("assets")
      .select("inventory_code,name,brand,model,serial_number,quantity,area,observations,is_disposed,created_at,updated_at,family:asset_families(name),status:asset_statuses(name),location:locations(name)")
      .order("created_at", { ascending: true })
      .range(offset, offset + chunkSize - 1);
    if (scope === "active") query = query.eq("is_disposed", false);
    if (scope === "disposed") query = query.eq("is_disposed", true);
    const { data, error } = await query;
    if (error) return new Response("No fue posible generar la exportación", { status: 500 });
    const chunk = (data ?? []) as unknown as ExportRow[];
    rows.push(...chunk);
    if (chunk.length < chunkSize) break;
    offset += chunkSize;
  }

  const header = ["Código inventario","Nombre","Familia","Marca","Modelo","Serie","Cantidad","Ubicación","Área","Estado","Dado de baja","Observaciones","Creado","Actualizado"];
  const lines = [header.map(safeCell).join(",")];
  for (const row of rows) {
    lines.push([
      row.inventory_code,
      row.name,
      relationOne(row.family)?.name,
      row.brand,
      row.model,
      row.serial_number,
      row.quantity,
      relationOne(row.location)?.name,
      row.area,
      relationOne(row.status)?.name,
      row.is_disposed ? "Sí" : "No",
      row.observations,
      row.created_at,
      row.updated_at,
    ].map(safeCell).join(","));
  }

  const date = new Date().toISOString().slice(0, 10);
  const filename = `inventario-colegio-providencia-${scope}-${date}.csv`;
  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
