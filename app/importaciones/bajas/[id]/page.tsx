import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { reconcileLegacyDisposal } from "@/app/importaciones/bajas/actions";
import { requirePermission } from "@/lib/auth/require-admin";
import { legacyDate, legacyText } from "@/lib/legacy/access-fields";

type Relation<T> = T | T[] | null;
type AssetCandidate = {
  id: string;
  inventory_code: string | null;
  name: string | null;
  asset_type: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  is_disposed: boolean;
  family: Relation<{ name: string }>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function relationOne<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export const dynamic = "force-dynamic";

export default async function LegacyDisposalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const queryParams = await searchParams;
  const stageId = Number(id);
  if (!Number.isInteger(stageId) || stageId <= 0) notFound();

  const { supabase, profile } = await requirePermission("imports.manage");
  const { data: stage } = await supabase
    .from("legacy_imports")
    .select("id,source_table,source_id,payload,migration_status,migrated_asset_id,error_message,review_notes")
    .eq("id", stageId)
    .maybeSingle();

  if (!stage || !stage.source_table.toUpperCase().includes("BAJA")) notFound();

  const inventory = legacyText(stage.payload, "INVENTARIO", "CODIGO");
  const serial = legacyText(stage.payload, "SERIE");
  const brand = legacyText(stage.payload, "MARCA");
  const model = legacyText(stage.payload, "MODELO");
  const legacyObservations = legacyText(stage.payload, "OBSERVACIONES");
  const legacyDisposalDate = legacyDate(stage.payload, "REGISTRO BAJA", "FECHA BAJA", "FECHA");
  const q = first(queryParams.q).trim() || inventory || serial || [brand, model].filter(Boolean).join(" ");
  const safeSearch = q.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim();

  let candidates: AssetCandidate[] = [];
  if (safeSearch) {
    const { data } = await supabase
      .from("assets")
      .select("id,inventory_code,name,asset_type,brand,model,serial_number,is_disposed,family:asset_families(name)")
      .or(`inventory_code.ilike.%${safeSearch}%,serial_number.ilike.%${safeSearch}%,name.ilike.%${safeSearch}%,asset_type.ilike.%${safeSearch}%,brand.ilike.%${safeSearch}%,model.ilike.%${safeSearch}%`)
      .order("is_disposed", { ascending: true })
      .order("updated_at", { ascending: false })
      .limit(50);
    candidates = (data ?? []) as unknown as AssetCandidate[];
  }

  if (stage.migration_status === "migrated" && stage.migrated_asset_id) {
    return (
      <AppShell>
        <header className="topbar"><div><h1>Baja histórica reconciliada</h1><p>{stage.source_table} · {stage.source_id || stage.id}</p></div><Link className="button button-ghost" href="/importaciones/bajas">Volver</Link></header>
        <section className="panel panel-flush"><div className="info-box">Esta fila ya fue vinculada a un activo del inventario.</div><Link className="button button-primary" href={`/inventario/${stage.migrated_asset_id}`}>Abrir activo vinculado</Link></section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <header className="topbar">
        <div><h1>Reconciliar baja histórica</h1><p>{stage.source_table} · {stage.source_id || stage.id}</p></div>
        <Link className="button button-ghost" href="/importaciones/bajas">Volver</Link>
      </header>

      {queryParams.error ? <div className="error-box">No fue posible reconciliar la baja. Verifica que el activo elegido exista y que tengas permisos para darlo de baja.</div> : null}

      <section className="panel panel-flush">
        <div className="panel-heading"><div><h2>Datos recuperados desde Access</h2><p className="muted">Estos datos no se modifican; el payload original seguirá conservado.</p></div><span className="badge">{stage.migration_status}</span></div>
        <div className="detail-grid">
          <div className="detail-item"><span>Inventario</span><strong>{inventory || "—"}</strong></div>
          <div className="detail-item"><span>Serie</span><strong>{serial || "—"}</strong></div>
          <div className="detail-item"><span>Marca / modelo</span><strong>{[brand, model].filter(Boolean).join(" · ") || "—"}</strong></div>
          <div className="detail-item detail-wide"><span>Observaciones legado</span><strong>{legacyObservations || "—"}</strong></div>
        </div>
        <details><summary>Ver payload original completo</summary><div className="audit-json-grid"><div><span>Fila Access</span><pre>{JSON.stringify(stage.payload ?? {}, null, 2)}</pre></div></div></details>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h2>Buscar el activo correcto</h2><p className="muted">La vinculación es manual para evitar dar de baja el equipo equivocado cuando Access tiene códigos o series repetidos.</p></div></div>
        <form className="filters compact-filters" method="get">
          <label className="field filter-search"><span>Código, serie, nombre, marca o modelo</span><input defaultValue={q} name="q" placeholder="Buscar en todo el inventario" /></label>
          <div className="filter-actions"><button className="button button-secondary" type="submit">Buscar</button></div>
        </form>
      </section>

      <form action={reconcileLegacyDisposal}>
        <input name="stage_id" type="hidden" value={stage.id} />
        <section className="panel">
          <div className="panel-heading"><div><h2>Candidatos</h2><p className="muted">Selecciona exactamente un activo. También se muestran equipos que ya están dados de baja para conservar antecedentes históricos.</p></div><span className="badge">{candidates.length} resultado(s)</span></div>
          {!safeSearch ? <div className="empty-state">Escribe un criterio de búsqueda.</div> : null}
          {safeSearch && !candidates.length ? <div className="empty-state">No encontramos candidatos. Prueba con otro código, serie, marca o modelo.</div> : null}
          {candidates.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Elegir</th><th>Código</th><th>Activo</th><th>Familia</th><th>Marca / modelo</th><th>Serie</th><th>Estado</th></tr></thead><tbody>{candidates.map((asset) => {
            const family = relationOne(asset.family);
            return <tr key={asset.id}><td><input aria-label={`Seleccionar ${asset.inventory_code || asset.name || asset.id}`} name="asset_id" required type="radio" value={asset.id} /></td><td><strong>{asset.inventory_code || "—"}</strong></td><td>{asset.name || asset.asset_type || "Sin descripción"}</td><td>{family?.name || "—"}</td><td>{[asset.brand, asset.model].filter(Boolean).join(" · ") || "—"}</td><td>{asset.serial_number || "—"}</td><td><span className={`status-pill ${asset.is_disposed ? "status-danger" : ""}`}>{asset.is_disposed ? "Ya dado de baja" : "Vigente"}</span></td></tr>;
          })}</tbody></table></div> : null}
        </section>

        <section className="panel">
          <div className="panel-heading"><div><h2>Registrar la baja histórica</h2><p className="muted">La operación es transaccional: activo, registro de baja, historial y fila legado se confirman juntos.</p></div></div>
          <div className="form-grid">
            <label className="field"><span>Fecha de baja</span><input defaultValue={legacyDisposalDate || new Date().toISOString().slice(0, 10)} name="disposal_date" type="date" required /></label>
            <label className="field"><span>Autorizado por</span><input defaultValue={profile.email} name="approved_by" /></label>
            <label className="field field-wide"><span>Motivo</span><input defaultValue="Baja histórica importada desde Microsoft Access" name="reason" required /></label>
            <label className="field field-wide"><span>Observaciones</span><textarea defaultValue={legacyObservations || ""} name="observations" rows={3} /></label>
          </div>
          <div className="form-actions"><button className="button button-danger" disabled={!candidates.length} type="submit">Confirmar reconciliación y baja</button></div>
        </section>
      </form>
    </AppShell>
  );
}
