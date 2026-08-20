alter table public.locations
  add column if not exists category text not null default 'legacy',
  add column if not exists display_order integer not null default 999,
  add column if not exists selectable boolean not null default false;

do $$ begin
  alter table public.locations add constraint locations_category_check
    check (category in ('classroom','office','dependency','legacy'));
exception when duplicate_object then null; end $$;

alter table public.assets
  add column if not exists responsible_name text;

alter table public.computer_details
  add column if not exists screen_size text,
  add column if not exists operating_system text,
  add column if not exists resolution text,
  add column if not exists touch_enabled boolean,
  add column if not exists touch_points integer;

do $$ begin
  alter table public.computer_details add constraint computer_details_touch_points_check
    check (touch_points is null or touch_points >= 0);
exception when duplicate_object then null; end $$;

-- Las ubicaciones históricas quedan preservadas, pero dejan de ser seleccionables
-- hasta que sean promovidas explícitamente a una ubicación oficial.
update public.locations
set category='legacy', display_order=999, selectable=false;

-- Salas oficiales 01 a 22. Se reutilizan los IDs existentes para no romper referencias.
do $$
declare
  i integer;
  canonical text;
begin
  for i in 1..22 loop
    canonical := 'Sala ' || lpad(i::text, 2, '0');
    update public.locations
       set name=canonical,
           area='Salas de clases',
           category='classroom',
           display_order=i,
           selectable=true,
           active=true
     where regexp_replace(upper(name), '\s+', '', 'g') = 'SALA' || lpad(i::text, 2, '0');

    if not found then
      insert into public.locations(name,area,description,active,category,display_order,selectable)
      values(canonical,'Salas de clases','Sala de clases oficial',true,'classroom',i,true)
      on conflict(name) do update
      set area=excluded.area,
          active=true,
          category='classroom',
          display_order=i,
          selectable=true;
    end if;
  end loop;
end $$;

-- Oficinas oficiales.
update public.locations set name='Dirección', area='Oficinas', category='office', display_order=1, selectable=true, active=true where name in ('DIRECCIÓN','Dirección');
update public.locations set name='Recepción', area='Oficinas', category='office', display_order=4, selectable=true, active=true where name in ('RECEPCION','Recepción');
update public.locations set name='Inspectoría', area='Oficinas', category='office', display_order=5, selectable=true, active=true where name in ('INSPECTORIA','Inspectoría');
update public.locations set area='Oficinas', category='office', display_order=6, selectable=true, active=true where name='UTP';
update public.locations set area='Oficinas', category='office', display_order=7, selectable=true, active=true where name='PIE';
update public.locations set name='Orientación', area='Oficinas', category='office', display_order=8, selectable=true, active=true where name in ('ORIENTACION','Orientación');

insert into public.locations(name,area,description,active,category,display_order,selectable) values
('Dirección','Oficinas','Oficina oficial',true,'office',1,true),
('Subdirección','Oficinas','Oficina oficial',true,'office',2,true),
('Jefe UTP','Oficinas','Oficina oficial',true,'office',3,true),
('Recepción','Oficinas','Oficina oficial',true,'office',4,true),
('Inspectoría','Oficinas','Oficina oficial',true,'office',5,true),
('UTP','Oficinas','Oficina oficial',true,'office',6,true),
('PIE','Oficinas','Oficina oficial',true,'office',7,true),
('Orientación','Oficinas','Oficina oficial',true,'office',8,true),
('Pastoral','Oficinas','Oficina oficial',true,'office',9,true)
on conflict(name) do update
set area=excluded.area,
    active=true,
    category=excluded.category,
    display_order=excluded.display_order,
    selectable=true;

-- Dependencias oficiales.
update public.locations set name='Biblioteca', area='Dependencias', category='dependency', display_order=1, selectable=true, active=true where name in ('BIBLIOTECA','Biblioteca');
update public.locations set name='Música', area='Dependencias', category='dependency', display_order=2, selectable=true, active=true where name in ('MUSICA','Música');
update public.locations set name='Arte', area='Dependencias', category='dependency', display_order=3, selectable=true, active=true where name in ('ARTE','Arte');
update public.locations set name='Ciencias', area='Dependencias', category='dependency', display_order=4, selectable=true, active=true where name in ('CIENCIAS','Ciencias');
update public.locations set name='Computación', area='Dependencias', category='dependency', display_order=5, selectable=true, active=true where name in ('COMPUTACION','Computación');

insert into public.locations(name,area,description,active,category,display_order,selectable) values
('Biblioteca','Dependencias','Dependencia oficial',true,'dependency',1,true),
('Música','Dependencias','Dependencia oficial',true,'dependency',2,true),
('Arte','Dependencias','Dependencia oficial',true,'dependency',3,true),
('Ciencias','Dependencias','Dependencia oficial',true,'dependency',4,true),
('Computación','Dependencias','Dependencia oficial',true,'dependency',5,true)
on conflict(name) do update
set area=excluded.area,
    active=true,
    category=excluded.category,
    display_order=excluded.display_order,
    selectable=true;

create or replace function public.create_asset_atomic(p_asset jsonb, p_details jsonb default '{}'::jsonb)
returns uuid
language plpgsql
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_asset_id uuid;
  v_family_code text;
  v_after jsonb;
  v_family_id uuid;
  v_status_id uuid;
  v_location_id uuid;
  v_quantity integer;
  v_touch boolean;
  v_touch_points integer;
begin
  if v_actor is null then raise exception 'Usuario no autenticado'; end if;
  if not public.has_permission('inventory.create') then raise exception 'Permiso inventory.create requerido'; end if;

  v_family_id:=nullif(p_asset->>'family_id','')::uuid;
  v_status_id:=nullif(p_asset->>'status_id','')::uuid;
  v_location_id:=nullif(p_asset->>'location_id','')::uuid;
  v_quantity:=greatest(coalesce(nullif(p_asset->>'quantity','')::integer,1),1);

  if v_family_id is null then raise exception 'La familia tecnológica es obligatoria'; end if;
  select f.code into v_family_code from public.asset_families f where f.id=v_family_id and f.active=true;
  if v_family_code is null then raise exception 'Familia tecnológica inválida o inactiva'; end if;
  if v_location_id is not null and not exists(select 1 from public.locations l where l.id=v_location_id and l.active=true) then
    raise exception 'Ubicación inválida o inactiva';
  end if;

  insert into public.assets(
    inventory_code,family_id,status_id,location_id,name,asset_type,brand,model,
    serial_number,quantity,area,responsible_name,observations,created_by,updated_by
  ) values(
    nullif(btrim(p_asset->>'inventory_code'),''),v_family_id,v_status_id,v_location_id,
    nullif(btrim(p_asset->>'name'),''),nullif(btrim(p_asset->>'asset_type'),''),
    nullif(btrim(p_asset->>'brand'),''),nullif(btrim(p_asset->>'model'),''),
    nullif(btrim(p_asset->>'serial_number'),''),v_quantity,nullif(btrim(p_asset->>'area'),''),
    nullif(btrim(p_asset->>'responsible_name'),''),nullif(btrim(p_asset->>'observations'),''),v_actor,v_actor
  ) returning id into v_asset_id;

  if v_family_code='computer' then
    v_touch:=case lower(coalesce(p_details->>'touch_enabled',''))
      when 'true' then true when 'si' then true when 'sí' then true when '1' then true
      when 'false' then false when 'no' then false when '0' then false else null end;
    v_touch_points:=case when coalesce(p_details->>'touch_points','') ~ '^\d+$' then (p_details->>'touch_points')::integer else null end;

    insert into public.computer_details(
      asset_id,memory,storage,screen,keyboard,battery,charger,screen_size,
      operating_system,resolution,touch_enabled,touch_points
    ) values(
      v_asset_id,nullif(btrim(p_details->>'memory'),''),nullif(btrim(p_details->>'storage'),''),
      nullif(btrim(p_details->>'screen'),''),nullif(btrim(p_details->>'keyboard'),''),
      nullif(btrim(p_details->>'battery'),''),nullif(btrim(p_details->>'charger'),''),
      nullif(btrim(p_details->>'screen_size'),''),nullif(btrim(p_details->>'operating_system'),''),
      nullif(btrim(p_details->>'resolution'),''),v_touch,v_touch_points
    );
  elsif v_family_code='projector' then
    insert into public.projector_details(asset_id,lumens,hdmi,vga)
    values(v_asset_id,nullif(btrim(p_details->>'lumens'),''),nullif(btrim(p_details->>'hdmi'),''),nullif(btrim(p_details->>'vga'),''));
  elsif v_family_code='television' then
    insert into public.television_details(asset_id,size)
    values(v_asset_id,nullif(btrim(p_details->>'size'),''));
  end if;

  select to_jsonb(a) into v_after from public.assets a where a.id=v_asset_id;
  insert into public.asset_history(asset_id,event_type,description,after_data,actor_id)
  values(v_asset_id,'created','Activo creado desde la aplicación web.',v_after,v_actor);
  return v_asset_id;
end;
$$;

create or replace function public.update_asset_atomic(p_asset_id uuid, p_asset jsonb, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_before jsonb;
  v_after jsonb;
  v_family_id uuid;
  v_family_code text;
  v_status_id uuid;
  v_location_id uuid;
  v_quantity integer;
  v_touch boolean;
  v_touch_points integer;
begin
  if v_actor is null then raise exception 'Usuario no autenticado'; end if;
  if not public.has_permission('inventory.edit') then raise exception 'Permiso inventory.edit requerido'; end if;

  select to_jsonb(a),a.family_id into v_before,v_family_id
  from public.assets a where a.id=p_asset_id for update;
  if v_before is null then raise exception 'Activo no encontrado'; end if;

  select f.code into v_family_code from public.asset_families f where f.id=v_family_id;
  v_status_id:=nullif(p_asset->>'status_id','')::uuid;
  v_location_id:=nullif(p_asset->>'location_id','')::uuid;
  v_quantity:=greatest(coalesce(nullif(p_asset->>'quantity','')::integer,1),1);

  if v_location_id is not null and not exists(select 1 from public.locations l where l.id=v_location_id and l.active=true) then
    raise exception 'Ubicación inválida o inactiva';
  end if;

  update public.assets set
    inventory_code=nullif(btrim(p_asset->>'inventory_code'),''),
    status_id=v_status_id,
    location_id=v_location_id,
    name=nullif(btrim(p_asset->>'name'),''),
    asset_type=nullif(btrim(p_asset->>'asset_type'),''),
    brand=nullif(btrim(p_asset->>'brand'),''),
    model=nullif(btrim(p_asset->>'model'),''),
    serial_number=nullif(btrim(p_asset->>'serial_number'),''),
    quantity=v_quantity,
    area=nullif(btrim(p_asset->>'area'),''),
    responsible_name=nullif(btrim(p_asset->>'responsible_name'),''),
    observations=nullif(btrim(p_asset->>'observations'),''),
    updated_by=v_actor
  where id=p_asset_id;

  if v_family_code='computer' then
    v_touch:=case lower(coalesce(p_details->>'touch_enabled',''))
      when 'true' then true when 'si' then true when 'sí' then true when '1' then true
      when 'false' then false when 'no' then false when '0' then false else null end;
    v_touch_points:=case when coalesce(p_details->>'touch_points','') ~ '^\d+$' then (p_details->>'touch_points')::integer else null end;

    insert into public.computer_details(
      asset_id,memory,storage,screen,keyboard,battery,charger,screen_size,
      operating_system,resolution,touch_enabled,touch_points
    ) values(
      p_asset_id,nullif(btrim(p_details->>'memory'),''),nullif(btrim(p_details->>'storage'),''),
      nullif(btrim(p_details->>'screen'),''),nullif(btrim(p_details->>'keyboard'),''),
      nullif(btrim(p_details->>'battery'),''),nullif(btrim(p_details->>'charger'),''),
      nullif(btrim(p_details->>'screen_size'),''),nullif(btrim(p_details->>'operating_system'),''),
      nullif(btrim(p_details->>'resolution'),''),v_touch,v_touch_points
    ) on conflict(asset_id) do update set
      memory=excluded.memory,
      storage=excluded.storage,
      screen=excluded.screen,
      keyboard=excluded.keyboard,
      battery=excluded.battery,
      charger=excluded.charger,
      screen_size=excluded.screen_size,
      operating_system=excluded.operating_system,
      resolution=excluded.resolution,
      touch_enabled=excluded.touch_enabled,
      touch_points=excluded.touch_points;
  elsif v_family_code='projector' then
    insert into public.projector_details(asset_id,lumens,hdmi,vga)
    values(p_asset_id,nullif(btrim(p_details->>'lumens'),''),nullif(btrim(p_details->>'hdmi'),''),nullif(btrim(p_details->>'vga'),''))
    on conflict(asset_id) do update set lumens=excluded.lumens,hdmi=excluded.hdmi,vga=excluded.vga;
  elsif v_family_code='television' then
    insert into public.television_details(asset_id,size)
    values(p_asset_id,nullif(btrim(p_details->>'size'),''))
    on conflict(asset_id) do update set size=excluded.size;
  end if;

  select to_jsonb(a) into v_after from public.assets a where a.id=p_asset_id;
  insert into public.asset_history(asset_id,event_type,description,before_data,after_data,actor_id)
  values(p_asset_id,'updated','Activo actualizado desde la aplicación web.',v_before,v_after,v_actor);
end;
$$;
