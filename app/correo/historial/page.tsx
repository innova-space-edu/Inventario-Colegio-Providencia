import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/require-admin";

type AttachmentEvidence = {
  filename?: string;
  size?: number;
  content_type?: string;
  sha256?: string;
};

type EmailHistoryRow = {
  id: string;
  sender_email: string;
  to_emails: string[] | null;
  cc_emails: string[] | null;
  subject: string;
  body_text: string | null;
  attachments: AttachmentEvidence[] | null;
  resend_message_id: string | null;
  status: "pending" | "sent" | "failed";
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function formatBytes(bytes?: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const dynamic = "force-dynamic";

export default async function EmailHistoryPage() {
  const { supabase } = await requireUser();
  const { data: isRoot } = await supabase.rpc("is_root_admin");

  if (isRoot !== true) redirect("/correo");

  const { data, error } = await supabase
    .from("email_send_history")
    .select("id,sender_email,to_emails,cc_emails,subject,body_text,attachments,resend_message_id,status,error_message,created_at,completed_at")
    .order("created_at", { ascending: false })
    .limit(250);

  const rows = (data ?? []) as EmailHistoryRow[];

  return (
    <AppShell>
      <header className="topbar">
        <div>
          <h1>Historial de correos</h1>
          <p>Evidencia de los mensajes enviados por usuarios autorizados desde el inventario.</p>
        </div>
        <div className="header-actions">
          <Link className="button button-ghost" href="/dashboard">Volver al panel</Link>
          <span className="badge">Solo superadministrador</span>
        </div>
      </header>

      {error ? (
        <section className="panel">
          <div className="error-box">No fue posible cargar el historial. Verifica que la migración de correo esté aplicada en Supabase.</div>
        </section>
      ) : null}

      {!error && rows.length === 0 ? (
        <section className="panel">
          <div className="empty-state">Todavía no existen correos registrados.</div>
        </section>
      ) : null}

      {!error && rows.length > 0 ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Evidencias registradas</h2>
              <p className="muted">Se muestran los últimos {rows.length} registros, del más reciente al más antiguo.</p>
            </div>
          </div>

          <div className="audit-list">
            {rows.map((row) => {
              const attachments = Array.isArray(row.attachments) ? row.attachments : [];
              const statusClass = row.status === "sent" ? "status-pill" : row.status === "failed" ? "status-pill status-danger" : "status-pill status-muted";
              const statusLabel = row.status === "sent" ? "Enviado" : row.status === "failed" ? "Fallido" : "Pendiente";

              return (
                <article className="audit-card" key={row.id}>
                  <div className="audit-card-head">
                    <div>
                      <strong>{row.sender_email}</strong>
                      <span>{row.subject}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span className={statusClass}>{statusLabel}</span>
                      <time>{formatDate(row.created_at)}</time>
                    </div>
                  </div>

                  <div className="detail-grid" style={{ marginTop: 14 }}>
                    <div className="detail-item detail-wide">
                      <span>Para</span>
                      <strong>{(row.to_emails ?? []).join(", ") || "—"}</strong>
                    </div>
                    <div className="detail-item detail-wide">
                      <span>CC</span>
                      <strong>{(row.cc_emails ?? []).join(", ") || "Sin copia"}</strong>
                    </div>
                    <div className="detail-item">
                      <span>ID Resend</span>
                      <strong>{row.resend_message_id || "—"}</strong>
                    </div>
                    <div className="detail-item">
                      <span>Finalizado</span>
                      <strong>{formatDate(row.completed_at)}</strong>
                    </div>
                    <div className="detail-item">
                      <span>Adjuntos</span>
                      <strong>{attachments.length}</strong>
                    </div>
                  </div>

                  <details style={{ marginTop: 14 }}>
                    <summary>Ver contenido y evidencia</summary>
                    <div className="audit-actions">
                      <div className="detail-item detail-wide">
                        <span>Mensaje</span>
                        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0, fontFamily: "inherit" }}>{row.body_text || "Sin versión de texto."}</pre>
                      </div>

                      {attachments.length > 0 ? (
                        <div className="detail-item detail-wide">
                          <span>Archivos adjuntos</span>
                          <div style={{ display: "grid", gap: 8 }}>
                            {attachments.map((attachment, index) => (
                              <div key={`${attachment.filename ?? "archivo"}-${index}`}>
                                <strong>{attachment.filename || "Archivo"} · {formatBytes(attachment.size)}</strong>
                                <small style={{ display: "block", marginTop: 3, overflowWrap: "anywhere" }}>
                                  SHA-256: {attachment.sha256 || "—"}
                                </small>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {row.error_message ? (
                        <div className="error-box">{row.error_message}</div>
                      ) : null}
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
