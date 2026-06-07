import type { FormEvent } from "react";

type LoginFormState = {
  tenantSlug: string;
  email: string;
  password: string;
};

type LoginViewProps = {
  form: LoginFormState;
  error: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFormChange: (next: LoginFormState) => void;
};

export function LoginView({ form, error, onSubmit, onFormChange }: LoginViewProps) {
  return (
    <main className="screen login-screen">
      <section className="auth-card">
        <p className="eyebrow">LMS B2B SCORM 2004</p>
        <h1>Controle seu tenant com seguranca</h1>
        <p className="support-text">
          Frontend inicial conectado ao backend para evoluirmos em paralelo.
        </p>

        <form className="form-grid" onSubmit={onSubmit}>
          <label>
            Tenant slug
            <input
              value={form.tenantSlug}
              onChange={(event) => onFormChange({ ...form, tenantSlug: event.target.value })}
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
            Senha
            <input
              type="password"
              value={form.password}
              onChange={(event) => onFormChange({ ...form, password: event.target.value })}
              required
            />
          </label>

          {error ? <p className="error-text">{error}</p> : null}

          <button type="submit">Entrar no painel</button>
        </form>
      </section>
    </main>
  );
}
