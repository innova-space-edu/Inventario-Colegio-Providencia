import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Relation<T> = T | T[] | null;
type ExportRow = { inventory_code: string | null; name: string | null; asset_type: string | null; brand: string | null; model: string | null; serial_number: string | null; quantity: number; area: string | null; observations: string | null; is_disposed: boolean; created_at: string; updated_at: string; family: Relation<{ name: string }>; status: Relation<{ name: string }>; location: Relation<{ name: string }> };
function relationOne<T>(value: Relation<T>): T | null { return Array.isArray(value) ? value[0] ?? null : value; }
function safeCell(value: unknown) { const raw = value === null || value === undefined ? "" : String(value); const neutralized = /^[=+\-@]/.test(raw) ? `'${raw}` : raw; return `"${neutralized.replace(/"/g, '""')}"`; }
function filenamePart(value: string | null) { return value ? value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40) : ""; }
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: claimData } = await supabase.auth.getClaims();
  const userId = claimData?.claims?.sub;
  if (!userId) return new Response("No autenticado", { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role,active").eq("id", userId).maybeSingle();
  if (!profile || profile.role !== "admin" || !profile.active) return new Response("Sin autorización", { status: 403 });

  const scope = request.nextUrl.searchParams.get("scope") || "all";
  const familyCode = request.nextUrl.searchParams.get("family");
  const statusCode = request.nextUrl.searchParams.get("status");
  const locationId = request.nextUrl.searchParams.get("location");

  const [{ data: family }, { data: status }, { data: location }] = await Promise.all([
    familyCode ? supabase.from("asset_families").select("id,code,name").eq("code", familyCode).maybeSingle() : Promise.resolve({ data: null }),
    statusCode ? supabase.from("asset_statuses").select("id,code,name").eq("code", statusCode).maybeSingle() : Promise.resolve({ data: null }),
    locationId ? supabase.from("locations").select("id,name").eq("id", locationId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (familyCode && !family) return new Response("Familia inválida", { status: 400 });
  if (statusCode && !status) return new Response("Estado inválido", { status: 400 });
  if (locationId && !location) return new Response("Ubicación inválida", { status: 400 });

  const rows: ExportRow[] = [];
  const chunkSize = 1000;
  let offset = 0;
  while (true) {
    let query = supabase.from("assets").select("inventory_code,name,asset_type,brand,model,serial_number,quantity,area,observations,is_disposed,created_at,updated_at,family:asset_families(name),status:asset_statuses(name),location:locations(name)").order("created_at", { ascending: true }).range(offset, offset + chunkSize - 1);
    if (scope === "active") query = query.eq("is_disposed", false);
    if (scope === "disposed") query = query.eq("is_disposed", true);
    if (family) query = query.eq("family_id", family.id);
    if (status) query = query.eq("status_id", status.id);
    if (location) query = query.eq("location_id", location.id);
    const { data, error } = await query;
    if (error) return new Response("No fue posible generar la exportación", { status: 500 });
    const chunk = (data ?? []) as unknown as ExportRow[];
    rows.push(...chunk);
    if (chunk.length < chunkSize) break;
    offset += chunkSize;
  }

  const header = ["Código inventario","Nombre","Tipo / subfamilia","Familia tecnológica","Marca","Modelo","Serie","Cantidad","Ubicación","Área","Estado","Dado de baja","Observaciones","Creado","Actualizado"];
  const lines = [header.map(safeCell).join(",")];
  for (const row of rows) lines.push([row.inventory_code,row.name,row.asset_type,relationOne(row.family)?.name,row.brand,row.model,row.serial_number,row.quantity,relationOne(row.location)?.name,row.area,relationOne(row.status)?.name,row.is_disposed ? "Sí" : "No",row.observations,row.created_at,row.updated_at].map(safeCell).join(","));

  const date = new Date().toISOString().slice(0, 10);
  const parts = ["inventario-colegio-providencia", scope, filenamePart(familyCode), filenamePart(statusCode), filenamePart(locationId), date].filter(Boolean);
  const filename = `${parts.join("-")}.csv`;
  return new Response(`\uFEFF${lines.join("\r\n")}`, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
}
