import { AppShell } from "@/components/app-shell";
import { requireRootAdmin } from "@/lib/auth/require-admin";
import { createRole, deleteRole, updateRoleMetadata, updateRolePermissions } from "@/app/roles/actions";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export const dynamic = "force-dynamic";

export default async function RolesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const errorCode = first(params.error);
  const { supabase } = await requireRootAdmin();

  const [{ data: roles }, { data: permissions }, { data: rolePermissions }, { data: assignments }] = await Promise.all([
    supabase.from("app_roles").select("id,code,name,description,is_system,active,created_at").order("is_system", { ascending: false }).order("name"),
    supabase.from("app_permissions").select("code,name,description,module").order("module").order("name"),
    supabase.from("role_permissions").select("role_id,permission_code"),
    supabase.from("user_roles").select("user_id,role_id"),
  ]);

  const permissionSetByRole = new Map<string, Set<string>>();
  for (const row of rolePermissions ?? []) {
    const set = permissionSetByRole.get(row.role_id) ?? new Set<string>();
    set.add(row.permission_code);
    permissionSetByRole.set(row.role_id, set);
  }

  const usersByRole = new Map<string, number>();
  for (const assignment of assignments ?? []) usersByRole.set(assignment.role_id, (usersByRole.get(assignment.role_id) ?? 0) + 1);

  const permissionGroups = new Map<string, typeof permissions>();
  for (const permission of permissions ?? []) {
    const group = permissionGroups.get(permission.module) ?? [];
    group.push(permission);
    permissionGroups.set(permission.module, group);
  }

  return (
    <AppShell>
      <header className="topbar"><div><h1>Roles y permisos</h1><p>Define qué puede ver y modificar cada tipo de usuario.</p></div><span className="badge">RBAC activo</span></header>
      {errorCode ? <div className="error-box">No se pudo completar la operación de roles ({errorCode}).</div> : null}

      <section className="panel panel-flush">
        <div className="panel-heading"><div><h2>Crear rol personalizado</h2><p className="muted">Después de crearlo podrás seleccionar sus permisos.</p></div></div>
        <form action={createRole} className="form-grid">
          <label className="field"><span>Nombre</span><input name="name" placeholder="Ej. Encargado audiovisual" required /></label>
          <label className="field"><span>Código interno (opcional)</span><input name="code" placeholder="encargado_audiovisual" /></label>
          <label className="field field-wide"><span>Descripción</span><input name="description" placeholder="Describe el alcance de este rol" /></label>
          <div className="form-actions field-wide"><button className="button button-primary" type="submit">Crear rol</button></div>
        </form>
      </section>

      {(roles ?? []).map((role) => {
        const selected = permissionSetByRole.get(role.id) ?? new Set<string>();
        const isRootRole = role.code === "super_admin";
        return <section className="panel" key={role.id}>
          <div className="panel-heading"><div><h2>{role.name}</h2><p className="muted"><code>{role.code}</code> · {usersByRole.get(role.id) ?? 0} usuario(s) · {selected.size} permiso(s)</p></div><span className={`status-pill ${role.active ? "" : "status-muted"}`}>{role.is_system ? "Rol del sistema" : "Personalizado"}</span></div>

          <form action={updateRoleMetadata} className="form-grid">
            <input name="role_id" type="hidden" value={role.id} />
            <label className="field"><span>Nombre</span><input defaultValue={role.name} disabled={isRootRole} name="name" required /></label>
            <label className="field"><span>Estado</span><select defaultValue={String(role.active)} disabled={isRootRole} name="active"><option value="true">Activo</option><option value="false">Inactivo</option></select></label>
            <label className="field field-wide"><span>Descripción</span><input defaultValue={role.description ?? ""} disabled={isRootRole} name="description" /></label>
            {!isRootRole ? <div className="form-actions field-wide"><button className="button button-secondary" type="submit">Guardar datos del rol</button></div> : null}
          </form>

          <form action={updateRolePermissions} className="permission-form">
            <input name="role_id" type="hidden" value={role.id} />
            {[...permissionGroups.entries()].map(([module, group]) => <fieldset className="permission-group" key={module}><legend>{module}</legend><div className="permission-grid">{group?.map((permission) => <label className="permission-check" key={permission.code}><input defaultChecked={isRootRole || selected.has(permission.code)} disabled={isRootRole} name="permissions" type="checkbox" value={permission.code} /><span><strong>{permission.name}</strong><small>{permission.description}</small></span></label>)}</div></fieldset>)}
            {!isRootRole ? <div className="form-actions"><button className="button button-primary" type="submit">Guardar permisos</button></div> : <p className="muted">El rol super_admin posee siempre todos los permisos y está reservado para admin@colprovidencia.cl.</p>}
          </form>

          {!role.is_system ? <details className="danger-details"><summary>Eliminar rol</summary><form action={deleteRole}><input name="role_id" type="hidden" value={role.id} /><button className="button button-danger" type="submit">Eliminar rol personalizado</button></form></details> : null}
        </section>;
      })}
    </AppShell>
  );
}
