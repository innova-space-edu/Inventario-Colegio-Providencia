"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import styles from "./email-composer.module.css";

const MAX_ATTACHMENT_MB = 20;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,24}$/i;
const EMBEDDED_EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+?\.(?:cl|com|org|net|edu|gov|io|ai|co|info|biz|me|app|dev|tech|online|school|pro)(?=[a-z0-9._%+-]+@|[\s,;]|$)/gi;

type RecipientFieldProps = {
  label: string;
  recipients: string[];
  draft: string;
  required?: boolean;
  onDraftChange: (value: string) => void;
  onRecipientsChange: (value: string[]) => void;
  onError: (message: string | null) => void;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeEmail(value: string) {
  return value.trim().replace(/^<|>$/g, "").toLowerCase();
}

function isValidEmail(value: string) {
  return EMAIL_PATTERN.test(normalizeEmail(value));
}

function extractEmbeddedEmails(value: string) {
  const emails: string[] = [];
  const remainder = value
    .replace(EMBEDDED_EMAIL_PATTERN, (match) => {
      emails.push(normalizeEmail(match));
      return " ";
    })
    .replace(/[\s,;]+/g, "")
    .trim();

  return { emails, remainder };
}

function RecipientField({
  label,
  recipients,
  draft,
  required,
  onDraftChange,
  onRecipientsChange,
  onError,
}: RecipientFieldProps) {
  function addCandidates(values: string[]) {
    const normalized = values.map(normalizeEmail).filter(Boolean);
    const invalid = normalized.find((value) => !isValidEmail(value));
    if (invalid) {
      onError(`La dirección ${invalid} no parece válida.`);
      return false;
    }

    const next = [...new Set([...recipients, ...normalized])];
    onRecipientsChange(next);
    onError(null);
    return true;
  }

  function commitDraft() {
    const value = normalizeEmail(draft);
    if (!value) return true;
    if (!isValidEmail(value)) return false;
    const committed = addCandidates([value]);
    if (committed) onDraftChange("");
    return committed;
  }

  useEffect(() => {
    const value = normalizeEmail(draft);
    if (!value || !isValidEmail(value)) return;

    const timer = window.setTimeout(() => {
      if (addCandidates([value])) onDraftChange("");
    }, 600);

    return () => window.clearTimeout(timer);
    // Se reinicia mientras el usuario continúa escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  function handleChange(value: string) {
    const hasSeparator = /[\s,;\n]/.test(value);
    const atCount = (value.match(/@/g) ?? []).length;

    if (hasSeparator || atCount >= 2) {
      const extracted = extractEmbeddedEmails(value);
      if (extracted.emails.length) addCandidates(extracted.emails);
      onDraftChange(extracted.remainder);
      return;
    }

    onDraftChange(value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (["Enter", "Tab", ",", ";"].includes(event.key)) {
      if (draft.trim()) {
        event.preventDefault();
        if (!commitDraft()) onError("Completa una dirección de correo válida.");
      }
      return;
    }

    if (event.key === "Backspace" && !draft && recipients.length) {
      onRecipientsChange(recipients.slice(0, -1));
    }
  }

  return (
    <div className={styles.fieldRow}>
      <span>{label}</span>
      <div className={styles.recipientInput}>
        {recipients.map((email) => (
          <span className={styles.recipientChip} key={email}>
            <span>{email}</span>
            <button
              aria-label={`Quitar ${email}`}
              onClick={() => onRecipientsChange(recipients.filter((item) => item !== email))}
              type="button"
            >
              ×
            </button>
          </span>
        ))}
        <input
          aria-label={label}
          autoCapitalize="none"
          autoComplete="off"
          inputMode="email"
          onBlur={() => {
            if (draft.trim() && !commitDraft()) onError("Completa una dirección de correo válida.");
          }}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={recipients.length ? "Agregar otro correo" : "Escribe o pega un correo"}
          required={required && recipients.length === 0 && !draft.trim()}
          spellCheck={false}
          type="text"
          value={draft}
        />
      </div>
    </div>
  );
}

export function EmailComposer({ accessEmail }: { accessEmail: string }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [toRecipients, setToRecipients] = useState<string[]>([]);
  const [ccRecipients, setCcRecipients] = useState<string[]>([]);
  const [toDraft, setToDraft] = useState("");
  const [ccDraft, setCcDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  function setRecipientError(message: string | null) {
    if (message) setStatus({ type: "error", message });
    else if (status?.type === "error") setStatus(null);
  }

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

  function resolveRecipients(recipients: string[], draft: string) {
    const pending = normalizeEmail(draft);
    if (!pending) return recipients;
    if (!isValidEmail(pending)) return null;
    return [...new Set([...recipients, pending])];
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const resolvedTo = resolveRecipients(toRecipients, toDraft);
    const resolvedCc = resolveRecipients(ccRecipients, ccDraft);

    if (!resolvedTo?.length) {
      setStatus({ type: "error", message: "Agrega al menos un destinatario válido en Para." });
      return;
    }
    if (!resolvedCc) {
      setStatus({ type: "error", message: "Revisa la dirección pendiente en CC." });
      return;
    }

    setSending(true);
    setStatus(null);

    const form = new FormData(formElement);
    const html = editorRef.current?.innerHTML.trim() ?? "";
    const text = editorRef.current?.innerText.trim() ?? "";
    form.set("to", resolvedTo.join(","));
    form.set("cc", resolvedCc.join(","));
    form.set("html", html);
    form.set("text", text);
    attachments.forEach((file) => form.append("attachments", file));

    try {
      const response = await fetch("/api/correo/send", { method: "POST", body: form });
      const data = (await response.json().catch(() => ({}))) as { error?: string; id?: string };
      if (!response.ok) throw new Error(data.error || "No fue posible enviar el correo.");

      setStatus({ type: "success", message: `Correo enviado correctamente${data.id ? ` · ID ${data.id}` : ""}.` });
      formElement.reset();
      if (editorRef.current) editorRef.current.innerHTML = "";
      setToRecipients([]);
      setCcRecipients([]);
      setToDraft("");
      setCcDraft("");
      setAttachments([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "No fue posible enviar el correo." });
    } finally {
      setSending(false);
    }
  }

  return (
    <form className={styles.composer} onSubmit={handleSubmit}>
      <section className={styles.window}>
        <div className={styles.windowHead}>
          <div>
            <span className={styles.eyebrow}>Nuevo correo</span>
            <strong>Redactar mensaje</strong>
          </div>
          <span className={styles.sender}>Respuestas a: {accessEmail}</span>
        </div>

        <div className={styles.fields}>
          <RecipientField
            draft={toDraft}
            label="Para"
            onDraftChange={setToDraft}
            onError={setRecipientError}
            onRecipientsChange={setToRecipients}
            recipients={toRecipients}
            required
          />
          <RecipientField
            draft={ccDraft}
            label="CC"
            onDraftChange={setCcDraft}
            onError={setRecipientError}
            onRecipientsChange={setCcRecipients}
            recipients={ccRecipients}
          />
          <label className={styles.fieldRow}>
            <span>Asunto</span>
            <input autoComplete="off" maxLength={180} name="subject" placeholder="Asunto del correo" required />
          </label>
        </div>

        <div className={styles.toolbar} aria-label="Herramientas de formato">
          <button aria-label="Negrita" onClick={() => runCommand("bold")} title="Negrita" type="button"><strong>B</strong></button>
          <button aria-label="Cursiva" onClick={() => runCommand("italic")} title="Cursiva" type="button"><em>I</em></button>
          <button aria-label="Subrayado" onClick={() => runCommand("underline")} title="Subrayado" type="button"><u>U</u></button>
          <span className={styles.toolbarSeparator} />
          <button onClick={() => runCommand("insertUnorderedList")} title="Lista con viñetas" type="button">• Lista</button>
          <button onClick={() => runCommand("insertOrderedList")} title="Lista numerada" type="button">1. Lista</button>
          <button onClick={addLink} title="Insertar enlace" type="button">Enlace</button>
          <span className={styles.toolbarSeparator} />
          <button onClick={() => runCommand("removeFormat")} title="Quitar formato" type="button">Limpiar formato</button>
        </div>

        <div
          aria-label="Mensaje"
          className={styles.editor}
          contentEditable
          data-placeholder="Escribe aquí el mensaje..."
          ref={editorRef}
          role="textbox"
          suppressContentEditableWarning
        />

        <div className={styles.attachments}>
          <div className={styles.attachmentActions}>
            <label className={`button button-ghost ${styles.attachButton}`}>
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
            <div className={styles.attachmentList}>
              {attachments.map((file, index) => (
                <div className={styles.attachmentChip} key={`${file.name}-${file.size}`}>
                  <span><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span>
                  <button aria-label={`Quitar ${file.name}`} onClick={() => removeAttachment(index)} type="button">×</button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <div className={styles.footerActions}>
        <div>
          {status ? <div className={status.type === "success" ? styles.success : "error-box"}>{status.message}</div> : null}
        </div>
        <button className={`button button-primary ${styles.sendButton}`} disabled={sending} type="submit">
          {sending ? "Enviando..." : "Enviar correo"}
        </button>
      </div>
    </form>
  );
}
