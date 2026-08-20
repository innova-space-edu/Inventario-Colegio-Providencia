import { AppShell } from "@/components/app-shell";
import { getPermissionCodes, requirePermission } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { assignManagedUserRole, createManagedUser, deleteManagedUser, setManagedUserActive } from "@/app/usuarios/actions";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const errorMessages: Record<string, string> = {
  server_key: "Falta la clave de servidor necesaria para administrar usuarios.",
  invalid: "Revisa el usuario y el rol seleccionado.",
  role: "El rol seleccionado no está disponible para asignación.",
  password: "La contraseña temporal no cumple los requisitos.",
  password_length: "La contraseña temporal debe tener al menos 10 caracteres. También puedes dejarla vacía para enviar una invitación.",
  password_policy: "Supabase rechazó la contraseña por la política de seguridad configurada. Usa una contraseña más fuerte o deja el campo vacío para invitar por correo.",
  email_exists: "Ese correo ya tiene una cuenta en Supabase Auth. Puedes administrarla desde la tabla de cuentas.",
  rate_limit: "Supabase aplicó un límite temporal de solicitudes. Espera un momento y vuelve a intentarlo.",
  create: "Supabase no pudo crear la cuenta con contraseña temporal.",
  invite: "Supabase no pudo enviar la invitación por correo.",
  profile: "La cuenta se creó, pero no fue posible preparar su perfil. La operación se revirtió para evitar una cuenta incompleta.",
  assign: "No fue posible asignar el rol al usuario.",
  protected: "El superadministrador está protegido y no puede modificarse.",
  status: "No fue posible cambiar el estado de acceso del usuario.",
  delete_confirmation: "Para eliminar una cuenta debes escribir exactamente su correo electrónico.",
  delete: "No fue posible eliminar la cuenta de Supabase Auth.",
};

export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const errorCode = first(params.error);
  const { supabase } = await requirePermission("users.view");
  const admin = createAdminClient();

  const [permissions, rootResult, rolesResult, profilesResult, assignmentsResult] = await Promise.all([
    getPermissionCodes(supabase),
    supabase.rpc("is_root_admin"),
    supabase.from("app_roles").select("id,code,name,description,active,is_system").eq("active", true).order("name"),
    supabase.from("profiles").select("id,email,role,active,created_at,updated_at").order("email"),
    supabase.from("user_roles").select("user_id,role_id"),
  ]);

  const roles = rolesResult.data ?? [];
  const profiles = profilesResult.data ?? [];
  const assignments = assignmentsResult.data ?? [];
  const permissionSet = new Set(permissions);
  const isRoot = rootResult.data === true;
  const canManage = permissionSet.has("users.manage");
  const canAssignRoles = permissionSet.has("users.assign_roles");
  const canCreateUsers = canManage && canAssignRoles;

  const roleById = new Map(roles.map((role) => [role.id, role]));
  const roleIdByUser = new Map(assignments.map((assignment) => [assignment.user_id, assignment.role_id]));
  const roleUseCount = new Map<string, number>();
  for (const assignment of assignments) roleUseCount.set(assignment.role_id, (roleUseCount.get(assignment.role_id) ?? 0) + 1);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const assignableRoles = roles.filter((role) => role.code !== "super_admin");

  let users: Array<{
    id: string;
    email?: string | null;
    created_at: string;
    last_sign_in_at?: string | null;
    email_confirmed_at?: string | null;
  }> = [];
  let adminApiError = false;

  if (admin) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) adminApiError = true;
    else users = data.users;
  }

  return (
    <AppShell>
      <header className="topbar">
        <div><h1>Usuarios</h1><p>Administración de cuentas, acceso y roles del Inventario Colegio Providencia.</p></div>
        <span className="badge">{isRoot ? "Superadministrador" : canManage && canAssignRoles ? "Administrador" : "Consulta de usuarios"}</span>
      </header>

      {!admin ? <div className="error-box"><strong>Falta la clave de servidor.</strong> Agrega <code>SUPABASE_SECRET_KEY</code> en Vercel. Debe ser una variable de servidor y nunca llevar el prefijo <code>NEXT_PUBLIC_</code>.</div> : null}
      {adminApiError ? <div className="error-box">La API administrativa de Supabase no pudo listar los usuarios. Revisa la clave secreta configurada en Vercel.</div> : null}
      {errorCode ? <div className="error-box">{errorMessages[errorCode] || `No se pudo completar la operación de usuarios (${errorCode}). Revisa los datos y vuelve a intentarlo.`}</div> : null}

      {canCreateUsers ? <section className="panel panel-flush">
        <div className="panel-heading"><div><h2>Crear o invitar usuario</h2><p className="muted">Sin contraseña temporal se enviará una invitación. Con contraseña temporal se crea la cuenta confirmada directamente.</p></div></div>
        <div className="info-box"><strong>Administrador disponible.</strong> El rol Administrador tiene acceso completo a la plataforma y puede ayudar a gestionar usuarios y roles, pero nunca puede modificar, desactivar, degradar ni eliminar al Superadministrador.</div>
        <form action={createManagedUser} className="form-grid">
          <label className="field"><span>Correo electrónico</span><input name="email" type="email" placeholder="usuario@colprovidencia.cl" required /></label>
          <label className="field"><span>Rol inicial</span><select name="role_id" required><option value="">Selecciona un rol</option>{assignableRoles.map((role) => <option key={role.id} value={role.id}>{role.name} · {roleUseCount.get(role.id) ?? 0} usuario(s)</option>)}</select></label>
          <label className="field field-wide"><span>Contraseña temporal (opcional, mínimo 10 caracteres)</span><input name="temporary_password" type="password" autoComplete="new-password" minLength={10} placeholder="Déjala vacía para enviar una invitación" /><small className="muted">Si escribes una contraseña, debe tener 10 o más caracteres y cumplir la política de seguridad de Supabase.</small></label>
          <div className="form-actions field-wide"><button className="button button-primary" disabled={!admin} type="submit">Crear / invitar usuario</button></div>
        </form>
      </section> : null}

      <section className="panel">
        <div className="panel-heading"><div><h2>Cuentas</h2><p className="muted">{users.length} usuario(s) encontrados en Supabase Auth.</p></div></div>
        {!users.length ? <div className="empty-state">{admin ? "No se encontraron usuarios." : "Configura SUPABASE_SECRET_KEY para administrar las cuentas desde la página."}</div> : null}
        {users.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Correo</th><th>Rol</th><th>Acceso</th><th>Confirmado</th><th>Último ingreso</th><th>Creado</th><th>Administrar</th></tr></thead><tbody>{users.map((user) => {
          const profile = profileById.get(user.id);
          const assignedRole = roleById.get(roleIdByUser.get(user.id) ?? "");
          const isRootUser = user.email?.toLowerCase() === "admin@colprovidencia.cl";
          const hasActions = canAssignRoles || canManage;
          return <tr key={user.id}>
            <td><strong>{user.email || "Sin correo"}</strong>{isRootUser ? <div className="muted">Superadministrador protegido</div> : null}</td>
            <td>{assignedRole?.name || (isRootUser ? "Superadministrador" : "Sin rol")}</td>
            <td><span className={`status-pill ${profile?.active === false ? "status-danger" : ""}`}>{profile?.active === false ? "Desactivado" : "Activo"}</span></td>
            <td>{user.email_confirmed_at ? "Sí" : "Pendiente"}</td>
            <td>{formatDate(user.last_sign_in_at)}</td>
            <td>{formatDate(user.created_at)}</td>
            <td>{isRootUser ? <span className="muted">Protegido</span> : hasActions ? <div className="user-admin-actions">
              {canAssignRoles ? <form action={assignManagedUserRole} className="inline-form"><input name="user_id" type="hidden" value={user.id} /><select defaultValue={assignedRole?.id || ""} name="role_id" required><option value="">Rol</option>{assignableRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><button className="button button-secondary" type="submit">Guardar rol</button></form> : null}
              {canManage ? <form action={setManagedUserActive}><input name="user_id" type="hidden" value={user.id} /><input name="active" type="hidden" value={profile?.active === false ? "true" : "false"} /><button className="button button-ghost" type="submit">{profile?.active === false ? "Activar" : "Desactivar"}</button></form> : null}
              {canManage ? <details className="danger-details"><summary>Eliminar</summary><form action={deleteManagedUser} className="inline-form"><input name="user_id" type="hidden" value={user.id} /><input name="confirmation" placeholder={`Escribe ${user.email || "el correo"}`} required /><button className="button button-danger" type="submit">Eliminar cuenta</button></form></details> : null}
            </div> : <span className="muted">Solo lectura</span>}</td>
          </tr>;
        })}</tbody></table></div> : null}
      </section>
    </AppShell>
  );
}
