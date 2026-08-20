import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/auth/require-admin";
import { legacyText } from "@/lib/legacy/access-fields";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export const dynamic = "force-dynamic";

export default async function LegacyDisposalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const status = first(params.status) || "pending";
  const q = first(params.q).trim();
  const requestedPage = Number(first(params.page) || "1");
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
  const pageSize = 30;
  const { supabase } = await requirePermission("imports.manage");

  let query = supabase
    .from("legacy_imports")
    .select("id,source_table,source_id,payload,migration_status,error_message,migrated_asset_id,review_notes,imported_at", { count: "exact" })
    .ilike("source_table", "%BAJA%")
    .order("imported_at", { ascending: false });

  if (["pending", "error", "ignored", "migrated"].includes(status)) query = query.eq("migration_status", status);
  if (q) query = query.ilike("source_id", `%${q.replace(/[%_,]/g, "")}%`);

  const from = (page - 1) * pageSize;
  const { data, count, error } = await query.range(from, from + pageSize - 1);
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const buildHref = (nextPage: number) => {
    const search = new URLSearchParams();
    if (status) search.set("status", status);
    if (q) search.set("q", q);
    if (nextPage > 1) search.set("page", String(nextPage));
    return `/importaciones/bajas?${search}`;
  };

  return (
    <AppShell>
      <header className="topbar">
        <div><h1>Bajas históricas de Access</h1><p>Vincula cada registro BAJA legado con el activo correcto sin eliminar ni inventar información.</p></div>
        <Link className="button button-ghost" href="/importaciones">Volver a importaciones</Link>
      </header>

      {first(params.reconciled) === "1" ? <div className="info-box">Baja histórica reconciliada correctamente.</div> : null}

      <section className="panel panel-flush">
        <form className="filters compact-filters" method="get">
          <label className="field"><span>Estado</span><select defaultValue={status} name="status"><option value="pending">Pendientes</option><option value="error">Con error</option><option value="migrated">Reconciliadas</option><option value="ignored">Ignoradas</option></select></label>
          <label className="field filter-search"><span>ID de la fila fuente</span><input defaultValue={q} name="q" placeholder="Buscar ID legado" /></label>
          <div className="filter-actions"><button className="button button-secondary" type="submit">Filtrar</button><Link className="button button-ghost" href="/importaciones/bajas">Limpiar</Link></div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h2>Registros de baja</h2><p className="muted">{total} fila{total === 1 ? "" : "s"} · página {page} de {totalPages}.</p></div><span className="badge">{status}</span></div>
        {error ? <div className="error-box">No fue posible cargar las filas BAJA de Access.</div> : null}
        {!error && !data?.length ? <div className="empty-state">No hay registros BAJA con este estado.</div> : null}
        {data?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Tabla</th><th>ID</th><th>Inventario</th><th>Serie</th><th>Marca / modelo</th><th>Observación</th><th>Importado</th><th /></tr></thead><tbody>{data.map((row) => {
          const inventory = legacyText(row.payload, "INVENTARIO", "CODIGO");
          const serial = legacyText(row.payload, "SERIE");
          const brand = legacyText(row.payload, "MARCA");
          const model = legacyText(row.payload, "MODELO");
          const observations = legacyText(row.payload, "OBSERVACIONES");
          return <tr key={row.id}><td>{row.source_table}</td><td><strong>{row.source_id || row.id}</strong></td><td>{inventory || "—"}</td><td>{serial || "—"}</td><td>{[brand, model].filter(Boolean).join(" · ") || "—"}</td><td>{observations || row.error_message || "—"}</td><td>{formatDate(row.imported_at)}</td><td>{row.migration_status === "migrated" && row.migrated_asset_id ? <Link className="table-link" href={`/inventario/${row.migrated_asset_id}`}>Ver activo</Link> : row.migration_status !== "ignored" ? <Link className="table-link" href={`/importaciones/bajas/${row.id}`}>Reconciliar</Link> : "—"}</td></tr>;
        })}</tbody></table></div> : null}
        {totalPages > 1 ? <nav className="pagination"><Link className={`button button-ghost ${page <= 1 ? "disabled" : ""}`} href={buildHref(Math.max(1, page - 1))}>Anterior</Link><span>{page} / {totalPages}</span><Link className={`button button-ghost ${page >= totalPages ? "disabled" : ""}`} href={buildHref(Math.min(totalPages, page + 1))}>Siguiente</Link></nav> : null}
      </section>
    </AppShell>
  );
}
