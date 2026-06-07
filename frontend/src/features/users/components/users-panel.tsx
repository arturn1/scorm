import type { FormEvent } from "react";
import type { TenantUser, UserRole } from "../../../types";

type UserFormState = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
};

type UsersPanelProps = {
  canManageUsers: boolean;
  loading: boolean;
  error: string | null;
  users: TenantUser[];
  form: UserFormState;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onFormChange: (next: UserFormState) => void;
  onRoleChange: (user: TenantUser, role: UserRole) => void;
  onToggleActive: (user: TenantUser) => void;
  onDelete: (user: TenantUser) => void;
};

export function UsersPanel({
  canManageUsers,
  loading,
  error,
  users,
  form,
  onCreate,
  onFormChange,
  onRoleChange,
  onToggleActive,
  onDelete,
}: UsersPanelProps) {
  return (
    <article className="panel users-panel">
      <p className="eyebrow">Gestao de identidades</p>
      <h3>Usuarios do tenant</h3>
      <p className="support-text">Administre acessos, perfis e status operacionais do ambiente B2B.</p>
      {canManageUsers ? (
        <>
          <form className="form-grid" onSubmit={onCreate}>
            <label>
              Nome
              <input
                value={form.name}
                onChange={(event) => onFormChange({ ...form, name: event.target.value })}
                required
              />
            </label>

            <label>
              E-mail
              <input
                type="email"
                value={form.email}
                onChange={(event) => onFormChange({ ...form, email: event.target.value })}
                required
              />
            </label>

            <label>
              Senha inicial
              <input
                type="password"
                value={form.password}
                onChange={(event) => onFormChange({ ...form, password: event.target.value })}
                minLength={8}
                required
              />
            </label>

            <label>
              Role
              <select
                value={form.role}
                onChange={(event) =>
                  onFormChange({
                    ...form,
                    role: event.target.value as UserRole,
                  })
                }
              >
                <option value="TENANT_ADMIN">TENANT_ADMIN</option>
                <option value="INSTRUCTOR">INSTRUCTOR</option>
                <option value="LEARNER">LEARNER</option>
              </select>
            </label>

            <button type="submit">Criar usuario</button>
          </form>

          {error ? <p className="error-text spaced">{error}</p> : null}
          {loading ? <p className="support-text spaced">Carregando usuarios...</p> : null}

          <ul className="user-list spaced">
            {users.map((tenantUser) => (
              <li key={tenantUser.id}>
                <div className="user-header">
                  <h4>{tenantUser.name}</h4>
                  <small className={tenantUser.isActive ? "badge" : "badge danger"}>
                    {tenantUser.isActive ? "Ativo" : "Inativo"}
                  </small>
                </div>

                <p>{tenantUser.email}</p>

                <div className="user-actions">
                  <select
                    value={tenantUser.role}
                    onChange={(event) => onRoleChange(tenantUser, event.target.value as UserRole)}
                  >
                    <option value="TENANT_ADMIN">TENANT_ADMIN</option>
                    <option value="INSTRUCTOR">INSTRUCTOR</option>
                    <option value="LEARNER">LEARNER</option>
                  </select>

                  <button type="button" className="ghost" onClick={() => onToggleActive(tenantUser)}>
                    {tenantUser.isActive ? "Desativar" : "Ativar"}
                  </button>

                  <button type="button" className="danger-btn" onClick={() => onDelete(tenantUser)}>
                    Excluir
                  </button>
                </div>
              </li>
            ))}

            {!users.length && !loading ? (
              <li>
                <p>Nenhum usuario encontrado neste tenant.</p>
              </li>
            ) : null}
          </ul>
        </>
      ) : (
        <p className="support-text">Apenas TENANT_ADMIN pode gerir usuarios.</p>
      )}
    </article>
  );
}
