drop policy if exists locations_permission_delete on public.locations;

create policy locations_permission_delete
on public.locations
for delete
to authenticated
using (public.has_permission('locations.manage'));

comment on policy locations_permission_delete on public.locations is
  'Permite eliminar ubicaciones solo a usuarios con locations.manage. Las referencias existentes en assets bloquean el borrado mediante la FK.';
