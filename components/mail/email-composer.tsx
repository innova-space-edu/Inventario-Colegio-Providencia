"use client";

import { FormEvent, useRef, useState } from "react";

const MAX_ATTACHMENT_MB = 20;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EmailComposer({ senderEmail }: { senderEmail: string }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  function runCommand(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  }

  function addLink() {
    const url = window.prompt("Dirección del enlace (https://...)");
    if (!url) return;
    const safeUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    runCommand("createLink", safeUrl);
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const incoming = Array.from(files);
    const merged = [...attachments, ...incoming].filter(
      (file, index, all) => all.findIndex((candidate) => candidate.name === file.name && candidate.size === file.size) === index,
    );
    const totalBytes = merged.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_ATTACHMENT_MB * 1024 * 1024) {
      setStatus({ type: "error", message: `Los adjuntos no pueden superar ${MAX_ATTACHMENT_MB} MB en total.` });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setAttachments(merged);
    setStatus(null);
  }

  function removeAttachment(index: number) {
    setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setStatus(null);

    const form = new FormData(event.currentTarget);
    const html = editorRef.current?.innerHTML.trim() ?? "";
    const text = editorRef.current?.innerText.trim() ?? "";
    form.set("html", html);
    form.set("text", text);
    attachments.forEach((file) => form.append("attachments", file));

    try {
      const response = await fetch("/api/correo/send", { method: "POST", body: form });
      const data = (await response.json().catch(() => ({}))) as { error?: string; id?: string };
      if (!response.ok) throw new Error(data.error || "No fue posible enviar el correo.");

      setStatus({ type: "success", message: `Correo enviado correctamente${data.id ? ` · ID ${data.id}` : ""}.` });
      event.currentTarget.reset();
      if (editorRef.current) editorRef.current.innerHTML = "";
      setAttachments([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "No fue posible enviar el correo." });
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="mail-composer" onSubmit={handleSubmit}>
      <section className="mail-window">
        <div className="mail-window-head">
          <div>
            <span className="mail-eyebrow">Nuevo correo</span>
            <strong>Redactar mensaje</strong>
          </div>
          <span className="mail-sender">Respuestas a: {senderEmail}</span>
        </div>

        <div className="mail-fields">
          <label className="mail-field-row">
            <span>Para</span>
            <input autoComplete="off" name="to" placeholder="persona@dominio.cl, otra@dominio.cl" required />
          </label>
          <label className="mail-field-row">
            <span>CC</span>
            <input autoComplete="off" name="cc" placeholder="Copia opcional" />
          </label>
          <label className="mail-field-row">
            <span>Asunto</span>
            <input autoComplete="off" maxLength={180} name="subject" placeholder="Asunto del correo" required />
          </label>
        </div>

        <div className="mail-toolbar" aria-label="Herramientas de formato">
          <button aria-label="Negrita" onClick={() => runCommand("bold")} title="Negrita" type="button"><strong>B</strong></button>
          <button aria-label="Cursiva" onClick={() => runCommand("italic")} title="Cursiva" type="button"><em>I</em></button>
          <button aria-label="Subrayado" onClick={() => runCommand("underline")} title="Subrayado" type="button"><u>U</u></button>
          <span className="mail-toolbar-separator" />
          <button onClick={() => runCommand("insertUnorderedList")} title="Lista con viñetas" type="button">• Lista</button>
          <button onClick={() => runCommand("insertOrderedList")} title="Lista numerada" type="button">1. Lista</button>
          <button onClick={addLink} title="Insertar enlace" type="button">Enlace</button>
          <span className="mail-toolbar-separator" />
          <button onClick={() => runCommand("removeFormat")} title="Quitar formato" type="button">Limpiar formato</button>
        </div>

        <div
          aria-label="Mensaje"
          className="mail-editor"
          contentEditable
          data-placeholder="Escribe aquí el mensaje..."
          ref={editorRef}
          role="textbox"
          suppressContentEditableWarning
        />

        <div className="mail-attachments">
          <div className="mail-attachment-actions">
            <label className="button button-ghost mail-attach-button">
              <span>Adjuntar documentos</span>
              <input
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.webp"
                multiple
                onChange={(event) => handleFiles(event.target.files)}
                ref={fileInputRef}
                type="file"
              />
            </label>
            <span className="muted">PDF, Office, texto e imágenes · máximo {MAX_ATTACHMENT_MB} MB en total</span>
          </div>

          {attachments.length > 0 ? (
            <div className="mail-attachment-list">
              {attachments.map((file, index) => (
                <div className="mail-attachment-chip" key={`${file.name}-${file.size}`}>
                  <span><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span>
                  <button aria-label={`Quitar ${file.name}`} onClick={() => removeAttachment(index)} type="button">×</button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <div className="mail-footer-actions">
        <div>
          {status ? <div className={status.type === "success" ? "mail-success" : "error-box"}>{status.message}</div> : null}
        </div>
        <button className="button button-primary mail-send-button" disabled={sending} type="submit">
          {sending ? "Enviando..." : "Enviar correo"}
        </button>
      </div>
    </form>
  );
}
