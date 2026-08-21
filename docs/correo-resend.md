# Correo interno con Resend

## Acceso

La ruta `/correo` está disponible para cualquier usuario autenticado y activo del inventario. No requiere rol de administrador ni un permiso adicional.

## Seguridad

- La API key de Resend se usa únicamente en servidor.
- El remitente se define únicamente mediante variable de entorno y no puede ser modificado por el navegador.
- `reply_to` corresponde al correo del usuario autenticado que realiza el envío.
- Máximo 20 destinatarios por mensaje entre `Para` y `CC`.
- Máximo 10 MB por archivo y 20 MB en adjuntos por mensaje.
- La ruta de envío vuelve a validar que la cuenta de Supabase siga activa.

## Variables requeridas en Vercel

- `RESEND_API_KEY`
- `RESEND_EMAIL_FROM` (debe usar un dominio/remitente autorizado en Resend)

No se requiere una migración SQL para esta primera versión.
