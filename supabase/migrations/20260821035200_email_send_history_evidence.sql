-- Historial inmutable de correos enviados desde el inventario.
-- Los usuarios comunes no pueden leer ni alterar esta tabla.
-- El superadministrador puede consultar el historial completo.
-- Las escrituras se realizan únicamente desde el servidor con SUPABASE_SECRET_KEY.

create table if not exists public.email_send_history (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  sender_email text not null,
  to_emails text[] not null default '{}'::text[],
  cc_emails text[] not null default '{}'::text[],
  subject text not null,
  body_text text,
  body_html text,
  attachments jsonb not null default '[]'::jsonb,
  resend_message_id text,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists email_send_history_created_at_idx
  on public.email_send_history(created_at desc);
create index if not exists email_send_history_sender_idx
  on public.email_send_history(sender_user_id, created_at desc);
create index if not exists email_send_history_status_idx
  on public.email_send_history(status, created_at desc);

alter table public.email_send_history enable row level security;

revoke all on public.email_send_history from anon;
revoke insert, update, delete on public.email_send_history from authenticated;
grant select on public.email_send_history to authenticated;

drop policy if exists email_send_history_root_select on public.email_send_history;
create policy email_send_history_root_select
  on public.email_send_history
  for select
  to authenticated
  using (public.is_root_admin());

comment on table public.email_send_history is
  'Evidencia de intentos y envíos de correo realizados desde el Inventario TI. Solo visible para el superadministrador.';
