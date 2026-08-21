import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_RECIPIENTS = 20;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_SINGLE_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function cleanText(value: FormDataEntryValue | null, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseEmails(raw: string) {
  return [...new Set(raw.split(/[;,\n]+/).map((value) => value.trim()).filter(Boolean))];
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("id,email,active")
      .eq("id", userId)
      .maybeSingle();

    if (!profile?.active || !profile.email) {
      return NextResponse.json({ error: "Cuenta no autorizada." }, { status: 403 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_EMAIL_FROM || process.env.EMAIL_FROM;
    const replyTo = process.env.RESEND_REPLY_TO?.trim() || "";

    if (!resendApiKey || !from) {
      return NextResponse.json(
        { error: "El servicio de correo todavía no está configurado en Vercel." },
        { status: 503 },
      );
    }

    if (replyTo && !isValidEmail(replyTo)) {
      return NextResponse.json(
        { error: "RESEND_REPLY_TO no contiene una dirección válida." },
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

    const attachments = await Promise.all(
      files.map(async (file) => ({
        filename: safeFilename(file.name),
        content: Buffer.from(await file.arrayBuffer()).toString("base64"),
        content_type: file.type || "application/octet-stream",
      })),
    );

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
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject,
        text: text || undefined,
        html: html || undefined,
        ...(attachments.length ? { attachments } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Resend email error:", response.status, detail.slice(0, 2000));
      return NextResponse.json({ error: "Resend rechazó el envío. Revisa la configuración del remitente o la API key." }, { status: 502 });
    }

    const data = (await response.json()) as { id?: string };
    return NextResponse.json({ success: true, id: data.id ?? null });
  } catch (error) {
    console.error("Email route error:", error);
    return NextResponse.json({ error: "No fue posible enviar el correo." }, { status: 500 });
  }
}
