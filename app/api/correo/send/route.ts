import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_RECIPIENTS = 20;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_SINGLE_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function cleanText(value: FormDataEntryValue | null, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseEmails(raw: string) {
  return [...new Set(raw.split(/[;,\n]+/).map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sanitizeHtml(value: string) {
  return value
    .replace(/<\/?(?:script|iframe|object|embed|form|input|button|textarea|select|option|meta|link)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*(["']).*?\1/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript\s*:/gi, "");
}

function safeFilename(value: string) {
  return value.replace(/[\r\n"\\/]/g, "_").slice(0, 180) || "adjunto";
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = claimsData?.claims?.sub;

    if (!userId) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

    const [{ data: profile }, rootResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,email,active")
        .eq("id", userId)
        .maybeSingle(),
      supabase.rpc("is_root_admin"),
    ]);

    if (!profile?.active || !profile.email) {
      return NextResponse.json({ error: "Cuenta no autorizada." }, { status: 403 });
    }

    if (rootResult.data === true) {
      return NextResponse.json(
        { error: "El superadministrador tiene acceso al historial, pero no puede enviar correos." },
        { status: 403 },
      );
    }

    if (!isValidEmail(profile.email)) {
      return NextResponse.json(
        { error: "Tu cuenta no tiene un correo válido para recibir respuestas." },
        { status: 403 },
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_EMAIL_FROM || process.env.EMAIL_FROM;
    const admin = createAdminClient();

    if (!resendApiKey || !from) {
      return NextResponse.json(
        { error: "El servicio de correo todavía no está configurado en Vercel." },
        { status: 503 },
      );
    }

    if (!admin) {
      return NextResponse.json(
        { error: "No se puede registrar la evidencia del envío. El correo no fue enviado." },
        { status: 503 },
      );
    }

    const formData = await request.formData();
    const to = parseEmails(cleanText(formData.get("to"), 4000));
    const cc = parseEmails(cleanText(formData.get("cc"), 4000));
    const subject = cleanText(formData.get("subject"), 180);
    const text = cleanText(formData.get("text"), 30000);
    const html = sanitizeHtml(cleanText(formData.get("html"), 60000));

    if (!to.length || !subject || (!text && !html)) {
      return NextResponse.json({ error: "Para, asunto y mensaje son obligatorios." }, { status: 400 });
    }

    if ([...to, ...cc].some((email) => !isValidEmail(email))) {
      return NextResponse.json({ error: "Hay una dirección de correo no válida." }, { status: 400 });
    }

    if (to.length + cc.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: `Puedes enviar a un máximo de ${MAX_RECIPIENTS} destinatarios por mensaje.` }, { status: 400 });
    }

    const files = formData.getAll("attachments").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const totalAttachmentBytes = files.reduce((sum, file) => sum + file.size, 0);

    if (files.some((file) => file.size > MAX_SINGLE_ATTACHMENT_BYTES)) {
      return NextResponse.json({ error: "Cada adjunto puede pesar como máximo 10 MB." }, { status: 400 });
    }

    if (totalAttachmentBytes > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: "Los adjuntos no pueden superar 20 MB en total." }, { status: 400 });
    }

    const preparedFiles = await Promise.all(
      files.map(async (file) => {
        const bytes = Buffer.from(await file.arrayBuffer());
        return {
          resend: {
            filename: safeFilename(file.name),
            content: bytes.toString("base64"),
            content_type: file.type || "application/octet-stream",
          },
          evidence: {
            filename: safeFilename(file.name),
            size: file.size,
            content_type: file.type || "application/octet-stream",
            sha256: createHash("sha256").update(bytes).digest("hex"),
          },
        };
      }),
    );

    const { data: historyRow, error: historyInsertError } = await admin
      .from("email_send_history")
      .insert({
        sender_user_id: userId,
        sender_email: profile.email.toLowerCase(),
        to_emails: to,
        cc_emails: cc,
        subject,
        body_text: text || null,
        body_html: html || null,
        attachments: preparedFiles.map((item) => item.evidence),
        status: "pending",
      })
      .select("id")
      .single();

    if (historyInsertError || !historyRow?.id) {
      console.error("Email history insert error:", historyInsertError);
      return NextResponse.json(
        { error: "No se pudo registrar la evidencia. El correo no fue enviado." },
        { status: 503 },
      );
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        ...(cc.length ? { cc } : {}),
        reply_to: profile.email,
        subject,
        text: text || undefined,
        html: html || undefined,
        ...(preparedFiles.length ? { attachments: preparedFiles.map((item) => item.resend) } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Resend email error:", response.status, detail.slice(0, 2000));
      await admin
        .from("email_send_history")
        .update({
          status: "failed",
          error_message: `Resend ${response.status}: ${detail.slice(0, 1500)}`,
          completed_at: new Date().toISOString(),
        })
        .eq("id", historyRow.id);

      return NextResponse.json({ error: "Resend rechazó el envío. Revisa la configuración del remitente o la API key." }, { status: 502 });
    }

    const data = (await response.json()) as { id?: string };
    const { error: historyUpdateError } = await admin
      .from("email_send_history")
      .update({
        status: "sent",
        resend_message_id: data.id ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", historyRow.id);

    if (historyUpdateError) {
      console.error("Email history update error:", historyUpdateError);
    }

    return NextResponse.json({ success: true, id: data.id ?? null });
  } catch (error) {
    console.error("Email route error:", error);
    return NextResponse.json({ error: "No fue posible enviar el correo." }, { status: 500 });
  }
}
