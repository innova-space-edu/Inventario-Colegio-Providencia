-- Inventario Colegio Providencia
-- Esquema inicial seguro para Supabase/Postgres.

create extension if not exists pgcrypto;

create type public.inventory_role as enum ('admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role public.inventory_role not null default 'admin',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.asset_families (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  legacy_form text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.asset_statuses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  is_disposed boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  area text,
  description text,
  active boolean not null default true,
  legacy_value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  inventory_code text,
  family_id uuid not null references public.asset_families(id),
  status_id uuid references public.asset_statuses(id),
  location_id uuid references public.locations(id),
  name text,
  brand text,
  model text,
  serial_number text,
  quantity integer not null default 1 check (quantity > 0),
  area text,
  observations text,
  is_disposed boolean not null default false,
  legacy_source text,
  legacy_id text,
  legacy_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assets_inventory_code_nonempty check (inventory_code is null or btrim(inventory_code) <> ''),
  constraint assets_serial_nonempty check (serial_number is null or btrim(serial_number) <> '')
);

create unique index assets_inventory_code_unique_not_null
  on public.assets (upper(inventory_code))
  where inventory_code is not null;
create index assets_family_id_idx on public.assets(family_id);
create index assets_status_id_idx on public.assets(status_id);
create index assets_location_id_idx on public.assets(location_id);
create index assets_serial_number_idx on public.assets(serial_number);
create index assets_legacy_source_idx on public.assets(legacy_source, legacy_id);

create table public.computer_details (
  asset_id uuid primary key references public.assets(id) on delete cascade,
  memory text,
  storage text,
  screen text,
  keyboard text,
  battery text,
  charger text,
  legacy_data jsonb not null default '{}'::jsonb
);

create table public.projector_details (
  asset_id uuid primary key references public.assets(id) on delete cascade,
  lumens text,
  hdmi text,
  vga text,
  legacy_data jsonb not null default '{}'::jsonb
);

create table public.television_details (
  asset_id uuid primary key references public.assets(id) on delete cascade,
  size text,
  legacy_data jsonb not null default '{}'::jsonb
);

create table public.asset_history (
  id bigint generated always as identity primary key,
  asset_id uuid not null references public.assets(id) on delete cascade,
  event_type text not null,
  description text,
  before_data jsonb,
  after_data jsonb,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index asset_history_asset_id_created_at_idx on public.asset_history(asset_id, created_at desc);

create table public.asset_disposals (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id),
  disposal_date date not null default current_date,
  reason text,
  observations text,
  approved_by text,
  legacy_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index asset_disposals_asset_id_idx on public.asset_disposals(asset_id);

create table public.legacy_imports (
  id bigint generated always as identity primary key,
  source_table text not null,
  source_id text,
  payload jsonb not null,
  migrated_asset_id uuid references public.assets(id),
  migration_status text not null default 'pending' check (migration_status in ('pending','migrated','ignored','error')),
  error_message text,
  imported_at timestamptz not null default now()
);
create index legacy_imports_source_idx on public.legacy_imports(source_table, source_id);

create table public.migration_runs (
  id uuid primary key default gen_random_uuid(),
  source_file text not null,
  source_sha256 text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','completed','failed')),
  source_rows integer,
  imported_rows integer,
  rejected_rows integer,
  notes text
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  action text not null,
  table_name text not null,
  record_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index audit_logs_actor_id_idx on public.audit_logs(actor_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger locations_set_updated_at before update on public.locations
for each row execute function public.set_updated_at();
create trigger assets_set_updated_at before update on public.assets
for each row execute function public.set_updated_at();

create or replace function public.audit_inventory_change()
returns trigger
language plpgsql
as $$
declare
  v_record_id text;
begin
  if tg_op = 'DELETE' then
    v_record_id := old.id::text;
  else
    v_record_id := new.id::text;
  end if;

  insert into public.audit_logs(actor_id, action, table_name, record_id, before_data, after_data)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    v_record_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger assets_audit after insert or update or delete on public.assets
for each row execute function public.audit_inventory_change();
create trigger asset_disposals_audit after insert or update or delete on public.asset_disposals
for each row execute function public.audit_inventory_change();

insert into public.asset_families(code, name, legacy_form) values
  ('computer', 'Computadores', 'FORCOMPUTADORAS'),
  ('audio', 'Audio', 'FORAUDIO'),
  ('furniture', 'Muebles', 'FORMUEBLES'),
  ('printer', 'Impresoras', 'FORIMPRESORAS'),
  ('projector', 'Proyectores', 'FORPROYECTORES'),
  ('misc', 'Varios', 'FORVARIOS'),
  ('accessory', 'Accesorios', 'FORACCESORIOS'),
  ('television', 'Televisores', 'FORTELEVISORES');

insert into public.asset_statuses(code, name, is_disposed) values
  ('active', 'Activo', false),
  ('operational', 'Operativo', false),
  ('repair', 'En reparación', false),
  ('damaged', 'Dañado', false),
  ('loaned', 'Prestado', false),
  ('storage', 'En bodega', false),
  ('missing', 'Extraviado', false),
  ('disposed', 'Dado de baja', true);

revoke all on table public.profiles from anon;
revoke all on table public.asset_families from anon;
revoke all on table public.asset_statuses from anon;
revoke all on table public.locations from anon;
revoke all on table public.assets from anon;
revoke all on table public.computer_details from anon;
revoke all on table public.projector_details from anon;
revoke all on table public.television_details from anon;
revoke all on table public.asset_history from anon;
revoke all on table public.asset_disposals from anon;
revoke all on table public.legacy_imports from anon;
revoke all on table public.migration_runs from anon;
revoke all on table public.audit_logs from anon;

grant select on public.profiles to authenticated;
grant select, insert, update on public.asset_families to authenticated;
grant select, insert, update on public.asset_statuses to authenticated;
grant select, insert, update on public.locations to authenticated;
grant select, insert, update on public.assets to authenticated;
grant select, insert, update on public.computer_details to authenticated;
grant select, insert, update on public.projector_details to authenticated;
grant select, insert, update on public.television_details to authenticated;
grant select, insert on public.asset_history to authenticated;
grant select, insert, update on public.asset_disposals to authenticated;
grant select, insert, update on public.legacy_imports to authenticated;
grant select, insert, update on public.migration_runs to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.profiles enable row level security;
alter table public.asset_families enable row level security;
alter table public.asset_statuses enable row level security;
alter table public.locations enable row level security;
alter table public.assets enable row level security;
alter table public.computer_details enable row level security;
alter table public.projector_details enable row level security;
alter table public.television_details enable row level security;
alter table public.asset_history enable row level security;
alter table public.asset_disposals enable row level security;
alter table public.legacy_imports enable row level security;
alter table public.migration_runs enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select_self_admin on public.profiles
for select to authenticated
using ((select auth.uid()) = id and role = 'admin' and active = true);

create policy families_admin_select on public.asset_families for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
create policy families_admin_insert on public.asset_families for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
create policy families_admin_update on public.asset_families for update to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));

create policy statuses_admin_select on public.asset_statuses for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
create policy statuses_admin_insert on public.asset_statuses for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
create policy statuses_admin_update on public.asset_statuses for update to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));

create policy locations_admin_select on public.locations for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
create policy locations_admin_insert on public.locations for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
create policy locations_admin_update on public.locations for update to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));

create policy assets_admin_select on public.assets for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
create policy assets_admin_insert on public.assets for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
create policy assets_admin_update on public.assets for update to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));

create policy computer_admin_select on public.computer_details for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
create policy computer_admin_insert on public.computer_details for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
create policy computer_admin_update on public.computer_details for update to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));

create policy projector_admin_select on public.projector_details for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
create policy projector_admin_insert on public.projector_details for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
create policy projector_admin_update on public.projector_details for update to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));

create policy television_admin_select on public.television_details for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
create policy television_admin_insert on public.television_details for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
create policy television_admin_update on public.television_details for update to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));

create policy history_admin_select on public.asset_history for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
create policy history_admin_insert on public.asset_history for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));

create policy disposals_admin_select on public.asset_disposals for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
create policy disposals_admin_insert on public.asset_disposals for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
create policy disposals_admin_update on public.asset_disposals for update to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));

create policy legacy_admin_select on public.legacy_imports for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
create policy legacy_admin_insert on public.legacy_imports for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
create policy legacy_admin_update on public.legacy_imports for update to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));

create policy migration_runs_admin_select on public.migration_runs for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
create policy migration_runs_admin_insert on public.migration_runs for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
create policy migration_runs_admin_update on public.migration_runs for update to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));

create policy audit_admin_select on public.audit_logs for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
create policy audit_admin_insert on public.audit_logs for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));
