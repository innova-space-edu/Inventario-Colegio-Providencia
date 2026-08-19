-- Fidelidad con el inventario Access e importaciones repetibles.

alter table public.assets
  add column if not exists asset_type text;

create index if not exists assets_asset_type_idx on public.assets(asset_type);

create unique index if not exists assets_legacy_identity_unique
  on public.assets(legacy_source, legacy_id)
  where legacy_source is not null and legacy_id is not null;

create unique index if not exists legacy_imports_source_identity_unique
  on public.legacy_imports(source_table, source_id)
  where source_id is not null;

comment on column public.assets.asset_type is
  'Tipo o subfamilia original del activo. Conserva valores de FAMILIA del inventario Access sin confundirlos con asset_families.';
