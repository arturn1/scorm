import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createCourse, getCourses, login } from "./lib/api";
import { clearSession, readSession, writeSession } from "./lib/session";
import type { AuthSession, Course } from "./types";

import "./App.css";

type LoginFormState = {
  tenantSlug: string;
  email: string;
  password: string;
};

type CourseFormState = {
  title: string;
  description: string;
};

const defaultLoginForm: LoginFormState = {
  tenantSlug: "acme",
  email: "admin@acme.local",
  password: "Admin@123",
};

const defaultCourseForm: CourseFormState = {
  title: "",
  description: "",
};

function App() {
  const [session, setSession] = useState<AuthSession | null>(() => readSession());
  const [courses, setCourses] = useState<Course[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [courseError, setCourseError] = useState<string | null>(null);
  const [loginForm, setLoginForm] = useState<LoginFormState>(defaultLoginForm);
  const [courseForm, setCourseForm] = useState<CourseFormState>(defaultCourseForm);

  const canManageCourses = useMemo(() => {
    if (!session) {
      return false;
    }
    return ["TENANT_ADMIN", "INSTRUCTOR"].includes(session.user.role);
  }, [session]);

  useEffect(() => {
    if (!session) {
      setCourses([]);
      return;
    }

    const fetchCourses = async () => {
      setLoadingCourses(true);
      setCourseError(null);
      try {
        const items = await getCourses(session.token);
        setCourses(items);
      } catch (error) {
        setCourseError(error instanceof Error ? error.message : "Falha ao carregar cursos");
      } finally {
        setLoadingCourses(false);
      }
    };

    void fetchCourses();
  }, [session]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError(null);

    try {
      const authSession = await login(loginForm);
      writeSession(authSession);
      setSession(authSession);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Nao foi possivel autenticar");
    }
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    setCourseForm(defaultCourseForm);
  };

  const handleCreateCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || !canManageCourses) {
      return;
    }

    setCourseError(null);
    try {
      const item = await createCourse(session.token, {
        title: courseForm.title,
        description: courseForm.description || undefined,
      });
      setCourses((previous) => [item, ...previous]);
      setCourseForm(defaultCourseForm);
    } catch (error) {
      setCourseError(error instanceof Error ? error.message : "Falha ao criar curso");
    }
  };

  if (!session) {
    return (
      <main className="screen login-screen">
        <section className="auth-card">
          <p className="eyebrow">LMS B2B SCORM 2004</p>
          <h1>Controle seu tenant com seguranca</h1>
          <p className="support-text">
            Frontend inicial conectado ao backend para evoluirmos em paralelo.
          </p>

          <form className="form-grid" onSubmit={handleLogin}>
            <label>
              Tenant slug
              <input
                value={loginForm.tenantSlug}
                onChange={(event) =>
                  setLoginForm((previous) => ({ ...previous, tenantSlug: event.target.value }))
                }
                required
              />
            </label>

            <label>
              E-mail
              <input
                type="email"
                value={loginForm.email}
                onChange={(event) =>
                  setLoginForm((previous) => ({ ...previous, email: event.target.value }))
                }
                required
              />
            </label>

            <label>
              Senha
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) =>
                  setLoginForm((previous) => ({ ...previous, password: event.target.value }))
                }
                required
              />
            </label>

            {authError ? <p className="error-text">{authError}</p> : null}

            <button type="submit">Entrar no painel</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="screen dashboard-screen">
      <header className="topbar">
        <div>
          <p className="eyebrow">Tenant ativo</p>
          <h2>
            {session.tenant.name} ({session.tenant.slug})
          </h2>
          <p className="support-text">
            {session.user.name} • {session.user.role}
          </p>
        </div>
        <button className="ghost" onClick={handleLogout}>
          Sair
        </button>
      </header>

      <section className="panel-grid">
        <article className="panel">
          <h3>Cursos do tenant</h3>
          {loadingCourses ? <p className="support-text">Carregando cursos...</p> : null}
          {courseError ? <p className="error-text">{courseError}</p> : null}

          <ul className="course-list">
            {courses.map((course) => (
              <li key={course.id}>
                <h4>{course.title}</h4>
                <p>{course.description ?? "Sem descricao"}</p>
                <small>{course.scormVersion}</small>
              </li>
            ))}
            {!courses.length && !loadingCourses ? (
              <li>
                <p>Nenhum curso cadastrado ainda.</p>
              </li>
            ) : null}
          </ul>
        </article>

        <article className="panel">
          <h3>Novo curso</h3>
          {canManageCourses ? (
            <form className="form-grid" onSubmit={handleCreateCourse}>
              <label>
                Titulo
                <input
                  value={courseForm.title}
                  onChange={(event) =>
                    setCourseForm((previous) => ({ ...previous, title: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                Descricao
                <textarea
                  value={courseForm.description}
                  onChange={(event) =>
                    setCourseForm((previous) => ({
                      ...previous,
                      description: event.target.value,
                    }))
                  }
                />
              </label>

              <button type="submit">Criar curso</button>
            </form>
          ) : (
            <p className="support-text">
              Seu perfil nao tem permissao para criar cursos neste tenant.
            </p>
          )}
        </article>
      </section>
    </main>
  );
}

export default App;
