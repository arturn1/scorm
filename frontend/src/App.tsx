import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { login } from "./features/auth/api/auth.api";
import { LoginView } from "./features/auth/components/login-view";
import {
  createCourse,
  getCourses,
  getScormAttempts,
  getScormLaunchUrl,
  getScormOutline,
  getScormTrailProgress,
  updateCourseSettings,
  uploadScormPackage,
} from "./features/courses/api/courses.api";
import {
  buildScormPlayerUrl,
  ScormPlayer,
  type ScormRuntimeEvent,
} from "./features/courses/components/scorm-player";
import { CourseListPanel } from "./features/courses/components/course-list-panel";
import { CreateCoursePanel } from "./features/courses/components/create-course-panel";
import {
  createUser,
  deleteUser,
  getUsers,
  updateUser,
} from "./features/users/api/users.api";
import { UsersPanel } from "./features/users/components/users-panel";
import { clearSession, readSession, writeSession } from "./lib/session";
import type {
  AdminTab,
  AuthSession,
  Course,
  CourseFormState,
  CourseOutcome,
  LoginFormState,
  ScormAttempt,
  ScormOutlineItem,
  ScormTrailProgress,
  StudyItem,
  StudySession,
  TenantUser,
  UserFormState,
  UserRole,
} from "./types";

import "./App.css";

const defaultLoginForm: LoginFormState = {
  tenantSlug: "acme",
  email: "admin@acme.local",
  password: "Admin@123",
};

const defaultCourseForm: CourseFormState = {
  title: "",
  description: "",
};

const defaultUserForm: UserFormState = {
  name: "",
  email: "",
  password: "",
  role: "LEARNER",
};

function App() {
  // #region State
  const [session, setSession] = useState<AuthSession | null>(() =>
    readSession(),
  );
  const [courses, setCourses] = useState<Course[]>([]);
  const [outlineByCourseId, setOutlineByCourseId] = useState<
    Record<
      string,
      { sequencingDetected: boolean; items: ScormOutlineItem[] } | undefined
    >
  >({});
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [uploadingCourseId, setUploadingCourseId] = useState<string | null>(
    null,
  );
  const [loadingOutlineCourseId, setLoadingOutlineCourseId] = useState<
    string | null
  >(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [courseError, setCourseError] = useState<string | null>(null);
  const [courseInfo, setCourseInfo] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [studySession, setStudySession] = useState<StudySession | null>(null);
  const [trailProgressByCourseId, setTrailProgressByCourseId] = useState<
    Record<string, ScormTrailProgress | undefined>
  >({});
  const [studyCompletionNotice, setStudyCompletionNotice] = useState<
    string | null
  >(null);
  const [courseOutcomeById, setCourseOutcomeById] = useState<
    Record<string, CourseOutcome>
  >({});
  const [loadingOutcomes, setLoadingOutcomes] = useState(false);
  const [loginForm, setLoginForm] = useState<LoginFormState>(defaultLoginForm);
  const [courseForm, setCourseForm] =
    useState<CourseFormState>(defaultCourseForm);
  const [userForm, setUserForm] = useState<UserFormState>(defaultUserForm);
  const [adminTab, setAdminTab] = useState<AdminTab>("courses");
  // #endregion

  // #region Helpers
  const flattenPlayableItems = (items: ScormOutlineItem[]): StudyItem[] => {
    return items.flatMap((item) => {
      const current = item.launchUrl
        ? [{ title: item.title, launchUrl: item.launchUrl }]
        : [];
      return [...current, ...flattenPlayableItems(item.children)];
    });
  };

  const resolveCourseOutline = async (course: Course) => {
    const cached = outlineByCourseId[course.id];
    if (cached) {
      return cached;
    }

    const loaded = await getScormOutline(session!.token, course.id);
    setOutlineByCourseId((previous) => ({
      ...previous,
      [course.id]: loaded,
    }));

    return loaded;
  };

  const startStudySession = async (
    course: Course,
    preferredLaunchUrl?: string,
  ) => {
    if (!session) {
      return;
    }

    setCourseError(null);
    setCourseInfo(null);

    try {
      const [launchUrl, outline] = await Promise.all([
        preferredLaunchUrl
          ? Promise.resolve(preferredLaunchUrl)
          : getScormLaunchUrl(session.token, course.id),
        resolveCourseOutline(course),
      ]);

      const playableItems = flattenPlayableItems(outline.items);
      const currentLaunchUrl =
        preferredLaunchUrl ??
        playableItems.find((item) => item.launchUrl === launchUrl)?.launchUrl ??
        playableItems[0]?.launchUrl ??
        launchUrl;

      setStudySession({
        course,
        sequencingDetected: outline.sequencingDetected,
        outlineItems: outline.items,
        playableItems,
        currentLaunchUrl,
      });

      const trailProgress = await getScormTrailProgress(
        session.token,
        course.id,
      );
      setTrailProgressByCourseId((previous) => ({
        ...previous,
        [course.id]: trailProgress,
      }));
      setStudyCompletionNotice(
        trailProgress.overallProgress >= 100
          ? "Curso concluido. Parabens!"
          : null,
      );
    } catch (error) {
      setCourseError(
        error instanceof Error ? error.message : "Falha ao iniciar modo estudo",
      );
    }
  };

  const canManageCourses = useMemo(() => {
    if (!session) {
      return false;
    }
    return ["TENANT_ADMIN", "INSTRUCTOR"].includes(session.user.role);
  }, [session]);

  const canManageUsers = useMemo(() => {
    if (!session) {
      return false;
    }
    return session.user.role === "TENANT_ADMIN";
  }, [session]);

  const isAdminView = canManageCourses || canManageUsers;
  const isIndividualLearningView = !isAdminView;

  const managementMetrics = useMemo(() => {
    const totalUsers = users.length;
    const activeUsers = users.filter((item) => item.isActive).length;
    const learnerUsers = users.filter((item) => item.role === "LEARNER").length;
    const coursesWithScorm = courses.filter((item) =>
      Boolean(item.packagePath),
    ).length;

    return {
      totalUsers,
      activeUsers,
      learnerUsers,
      totalCourses: courses.length,
      coursesWithScorm,
    };
  }, [users, courses]);

  const continueLaunchByCourseId = useMemo(() => {
    const result: Record<string, string | undefined> = {};

    for (const course of courses) {
      const summary = trailProgressByCourseId[course.id];
      if (!summary) {
        result[course.id] = undefined;
        continue;
      }

      const candidates = Object.entries(summary.items)
        .filter(([, item]) => item.progress > 0 && item.progress < 100)
        .sort((a, b) => {
          const aTime = a[1].updatedAt ? Date.parse(a[1].updatedAt) : 0;
          const bTime = b[1].updatedAt ? Date.parse(b[1].updatedAt) : 0;
          return bTime - aTime;
        });

      result[course.id] = candidates[0]?.[0];
    }

    return result;
  }, [courses, trailProgressByCourseId]);

  const formatDateTime = (isoDate: string | null): string => {
    if (!isoDate) {
      return "--";
    }

    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(isoDate));
  };

  const refreshStudyTrailProgress = async (courseId: string) => {
    if (!session) {
      return;
    }

    try {
      const summary = await getScormTrailProgress(session.token, courseId);
      setTrailProgressByCourseId((previous) => {
        const previousOverall = previous[courseId]?.overallProgress ?? 0;
        if (summary.overallProgress >= 100 && previousOverall < 100) {
          setStudyCompletionNotice("Curso concluido. Parabens!");
        }

        return {
          ...previous,
          [courseId]: summary,
        };
      });
    } catch {
      // Keep UI responsive even if progress sync fails temporarily.
    }
  };

  const handleStudyRuntimeEvent = (event: ScormRuntimeEvent) => {
    if (!session || isAdminView || !studySession) {
      return;
    }

    if (event.courseId !== studySession.course.id) {
      return;
    }

    const shouldRefresh =
      event.eventType === "set_value" ||
      event.eventType === "commit" ||
      event.eventType === "terminate" ||
      event.eventType === "item_snapshot" ||
      event.eventType === "readonly";

    if (!shouldRefresh) {
      return;
    }

    if (event.eventType === "readonly") {
      setStudyCompletionNotice(
        "Curso concluido. Modo revisao habilitado para consulta.",
      );
    }

    void refreshStudyTrailProgress(studySession.course.id);
  };
  // #endregion

  // #region Effects
  useEffect(() => {
    if (!canManageUsers && adminTab === "identity") {
      setAdminTab("courses");
    }
  }, [adminTab, canManageUsers]);

  useEffect(() => {
    if (!session) {
      setCourses([]);
      setOutlineByCourseId({});
      return;
    }

    const fetchCourses = async () => {
      setLoadingCourses(true);
      setCourseError(null);
      setCourseInfo(null);
      try {
        const items = await getCourses(session.token);
        setCourses(items);
      } catch (error) {
        setCourseError(
          error instanceof Error ? error.message : "Falha ao carregar cursos",
        );
      } finally {
        setLoadingCourses(false);
      }
    };

    void fetchCourses();
  }, [session]);

  useEffect(() => {
    if (!session || !canManageUsers) {
      setUsers([]);
      return;
    }

    const fetchUsers = async () => {
      setLoadingUsers(true);
      setUserError(null);
      try {
        const items = await getUsers(session.token);
        setUsers(items);
      } catch (error) {
        setUserError(
          error instanceof Error ? error.message : "Falha ao carregar usuarios",
        );
      } finally {
        setLoadingUsers(false);
      }
    };

    void fetchUsers();
  }, [session, canManageUsers]);

  useEffect(() => {
    if (!session || !courses.length || !isIndividualLearningView) {
      setCourseOutcomeById({});
      return;
    }

    const fetchOutcomes = async () => {
      setLoadingOutcomes(true);

      try {
        const entries = await Promise.all(
          courses.map(async (course) => {
            if (!course.packagePath) {
              return [
                course.id,
                {
                  attempts: [] as ScormAttempt[],
                  trail: undefined as ScormTrailProgress | undefined,
                },
              ] as const;
            }

            const [attempts, trail] = await Promise.all([
              getScormAttempts(session.token, course.id),
              getScormTrailProgress(session.token, course.id),
            ]);

            return [course.id, { attempts, trail }] as const;
          }),
        );

        const trailMap = Object.fromEntries(
          entries.map(([courseId, data]) => [courseId, data.trail]),
        );
        const outcomeMap = Object.fromEntries(
          entries.map(([courseId, data]) => [
            courseId,
            deriveCourseOutcome(data.attempts, data.trail),
          ]),
        );

        setCourseOutcomeById(outcomeMap);
        setTrailProgressByCourseId(trailMap);
      } catch (error) {
        setCourseError(
          error instanceof Error
            ? error.message
            : "Falha ao carregar seus resultados",
        );
      } finally {
        setLoadingOutcomes(false);
      }
    };

    void fetchOutcomes();
  }, [session, courses, isIndividualLearningView]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError(null);

    try {
      const authSession = await login(loginForm);
      writeSession(authSession);
      setSession(authSession);
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Nao foi possivel autenticar",
      );
    }
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    setCourseForm(defaultCourseForm);
    setUserForm(defaultUserForm);
  };

  const handleCreateCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || !canManageCourses) {
      return;
    }

    setCourseError(null);
    setCourseInfo(null);
    try {
      const item = await createCourse(session.token, {
        title: courseForm.title,
        description: courseForm.description || undefined,
      });
      setCourses((previous) => [item, ...previous]);
      setCourseForm(defaultCourseForm);
    } catch (error) {
      setCourseError(
        error instanceof Error ? error.message : "Falha ao criar curso",
      );
    }
  };

  const handleUploadScormPackage = async (course: Course, file: File) => {
    if (!session || !canManageCourses) {
      return;
    }

    setCourseError(null);
    setCourseInfo(null);
    setUploadingCourseId(course.id);
    try {
      const result = await uploadScormPackage(session.token, course.id, file);
      setCourses((previous) =>
        previous.map((item) =>
          item.id === result.item.id ? result.item : item,
        ),
      );
      setCourseInfo(`Versao detectada: ${result.detectedScormVersion}`);
    } catch (error) {
      setCourseError(
        error instanceof Error ? error.message : "Falha ao enviar pacote SCORM",
      );
    } finally {
      setUploadingCourseId(null);
    }
  };

  const handleLaunchScorm = async (course: Course) => {
    if (isAdminView) {
      if (!session) {
        return;
      }

      try {
        const launchUrl = await getScormLaunchUrl(session.token, course.id);
        window.open(
          buildScormPlayerUrl({
            courseId: course.id,
            launchUrl,
            token: session.token,
          }),
          "_blank",
          "noopener,noreferrer",
        );
      } catch (error) {
        setCourseError(
          error instanceof Error
            ? error.message
            : "Falha ao abrir pre-visualizacao",
        );
      }
      return;
    }

    await startStudySession(course);
  };

  const deriveCourseOutcome = (
    attempts: ScormAttempt[],
    trail: ScormTrailProgress | undefined,
  ): CourseOutcome => {
    if (!attempts.length && !trail?.attemptId) {
      return {
        statusLabel: "Nao iniciado",
        scoreLabel: "--",
        attempts: 0,
        lastAttemptAt: null,
      };
    }

    const latest = attempts[0];
    const normalizedScore =
      trail?.averageQuizScore !== null && trail?.averageQuizScore !== undefined
        ? trail.averageQuizScore
        : latest?.scoreScaled !== null && latest?.scoreScaled !== undefined
          ? latest.scoreScaled * 100
          : latest?.scoreRaw !== null && latest?.scoreRaw !== undefined
            ? latest.scoreRaw
            : null;

    const passedByStatus = latest?.successStatus?.toLowerCase() === "passed";
    const failedByStatus = latest?.successStatus?.toLowerCase() === "failed";
    const completedByTrail = (trail?.overallProgress ?? 0) >= 100;
    const inProgressByTrail =
      (trail?.overallProgress ?? 0) > 0 && !completedByTrail;
    const passedByScore =
      normalizedScore !== null ? normalizedScore >= 70 : false;

    const statusLabel: CourseOutcome["statusLabel"] = completedByTrail
      ? passedByStatus
        ? "Aprovado"
        : failedByStatus
          ? "Reprovado"
          : normalizedScore === null || passedByScore
            ? "Aprovado"
            : "Reprovado"
      : inProgressByTrail || latest?.status === "IN_PROGRESS"
        ? "Em andamento"
        : "Nao iniciado";

    return {
      statusLabel,
      scoreLabel:
        normalizedScore !== null ? `${Math.round(normalizedScore)}%` : "--",
      attempts: attempts.length,
      lastAttemptAt: latest?.updatedAt ?? null,
    };
  };

  const handleLoadScormOutline = async (course: Course) => {
    if (!session) {
      return;
    }

    setCourseError(null);
    setCourseInfo(null);
    setLoadingOutlineCourseId(course.id);

    try {
      const outline = await getScormOutline(session.token, course.id);
      setOutlineByCourseId((previous) => ({
        ...previous,
        [course.id]: outline,
      }));
    } catch (error) {
      setCourseError(
        error instanceof Error
          ? error.message
          : "Falha ao carregar itens do manifest",
      );
    } finally {
      setLoadingOutlineCourseId(null);
    }
  };

  const handleLaunchOutlineItem = (course: Course, launchUrl: string) => {
    void startStudySession(course, launchUrl);
  };

  const navigateStudyItem = (step: number) => {
    if (!studySession) {
      return;
    }

    const currentIndex = studySession.playableItems.findIndex(
      (item) => item.launchUrl === studySession.currentLaunchUrl,
    );
    if (currentIndex < 0) {
      return;
    }

    const nextIndex = currentIndex + step;
    if (nextIndex < 0 || nextIndex >= studySession.playableItems.length) {
      return;
    }

    const target = studySession.playableItems[nextIndex];
    if (!target) {
      return;
    }

    setStudySession((previous) =>
      previous
        ? {
            ...previous,
            currentLaunchUrl: target.launchUrl,
          }
        : previous,
    );
  };

  // #endregion

  // #region Handlers
  const handleUpdateCourseSettings = async (
    course: Course,
    payload: {
      resumeMode?: "LAST_POSITION" | "RESTART";
      allowRetake?: boolean;
      reviewAfterCompletion?: boolean;
    },
  ) => {
    if (!session || !canManageCourses) {
      return;
    }

    setCourseError(null);
    try {
      const updated = await updateCourseSettings(
        session.token,
        course.id,
        payload,
      );
      setCourses((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item)),
      );
      setCourseInfo("Politicas de continuidade atualizadas.");
    } catch (error) {
      setCourseError(
        error instanceof Error
          ? error.message
          : "Falha ao atualizar politicas do curso",
      );
    }
  };

  const handleContinueCourse = (course: Course, launchUrl: string) => {
    void startStudySession(course, launchUrl);
  };

  const renderStudyOutline = (
    course: Course,
    items: ScormOutlineItem[],
    depth = 0,
  ) => {
    const trailSummary = trailProgressByCourseId[course.id];

    return (
      <ul className={depth === 0 ? "study-outline" : "study-outline nested"}>
        {items.map((item, index) => {
          const isActive = item.launchUrl === studySession?.currentLaunchUrl;
          const itemProgress = item.launchUrl
            ? trailSummary?.items[item.launchUrl]
            : undefined;
          const quizScoreLabel =
            itemProgress?.isQuiz && itemProgress.quizScore !== null
              ? `${Math.round(itemProgress.quizScore)}%`
              : null;

          return (
            <li key={`${item.identifier ?? item.title}-${index}`}>
              <div className="study-outline-row">
                <div className="study-outline-main">
                  <span>{item.title}</span>
                  {item.launchUrl ? (
                    <div className="study-item-meta">
                      <small>Consumo: {itemProgress?.progress ?? 0}%</small>
                      {quizScoreLabel ? (
                        <small>Quiz: {quizScoreLabel}</small>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {item.launchUrl ? (
                  <button
                    type="button"
                    className={isActive ? "ghost active-item" : "ghost"}
                    onClick={() =>
                      void startStudySession(course, item.launchUrl!)
                    }
                  >
                    {isActive ? "Em andamento" : "Abrir"}
                  </button>
                ) : null}
              </div>
              {item.children.length
                ? renderStudyOutline(course, item.children, depth + 1)
                : null}
            </li>
          );
        })}
      </ul>
    );
  };

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || !canManageUsers) {
      return;
    }

    setUserError(null);

    try {
      const item = await createUser(session.token, userForm);
      setUsers((previous) => [item, ...previous]);
      setUserForm(defaultUserForm);
    } catch (error) {
      setUserError(
        error instanceof Error ? error.message : "Falha ao criar usuario",
      );
    }
  };

  const handleRoleChange = async (target: TenantUser, role: UserRole) => {
    if (!session || !canManageUsers || target.role === role) {
      return;
    }

    setUserError(null);
    try {
      const updated = await updateUser(session.token, target.id, { role });
      setUsers((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (error) {
      setUserError(
        error instanceof Error ? error.message : "Falha ao atualizar role",
      );
    }
  };

  const handleToggleUserActive = async (target: TenantUser) => {
    if (!session || !canManageUsers) {
      return;
    }

    setUserError(null);
    try {
      const updated = await updateUser(session.token, target.id, {
        isActive: !target.isActive,
      });
      setUsers((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (error) {
      setUserError(
        error instanceof Error
          ? error.message
          : "Falha ao atualizar status do usuario",
      );
    }
  };

  const handleDeleteUser = async (target: TenantUser) => {
    if (!session || !canManageUsers) {
      return;
    }

    const confirmed = window.confirm(`Excluir usuario ${target.email}?`);
    if (!confirmed) {
      return;
    }

    setUserError(null);
    try {
      await deleteUser(session.token, target.id);
      setUsers((previous) => previous.filter((item) => item.id !== target.id));
    } catch (error) {
      setUserError(
        error instanceof Error ? error.message : "Falha ao excluir usuario",
      );
    }
  };
  // #endregion

  // #region Render
  if (!session) {
    return (
      <LoginView
        form={loginForm}
        error={authError}
        onSubmit={handleLogin}
        onFormChange={setLoginForm}
      />
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
        {canManageUsers ? (
          <article className="panel admin-overview-panel">
            <p className="eyebrow">Painel de gestao</p>
            <h3>Operacao do tenant</h3>
            <div className="management-metrics">
              <div className="metric-card">
                <small>Usuarios ativos</small>
                <strong>{managementMetrics.activeUsers}</strong>
              </div>
              <div className="metric-card">
                <small>Total de usuarios</small>
                <strong>{managementMetrics.totalUsers}</strong>
              </div>
              <div className="metric-card">
                <small>Aprendizes</small>
                <strong>{managementMetrics.learnerUsers}</strong>
              </div>
              <div className="metric-card">
                <small>Cursos com SCORM</small>
                <strong>
                  {managementMetrics.coursesWithScorm}/
                  {managementMetrics.totalCourses}
                </strong>
              </div>
            </div>
          </article>
        ) : null}

        {isAdminView ? (
          <article className="panel admin-tabs-panel">
            <div
              className="admin-tabs"
              role="tablist"
              aria-label="Gestao administrativa"
            >
              {canManageCourses ? (
                <button
                  type="button"
                  className={
                    adminTab === "courses" ? "tab-button active" : "tab-button"
                  }
                  onClick={() => setAdminTab("courses")}
                >
                  Gestao de cursos
                </button>
              ) : null}
              {canManageUsers ? (
                <button
                  type="button"
                  className={
                    adminTab === "identity" ? "tab-button active" : "tab-button"
                  }
                  onClick={() => setAdminTab("identity")}
                >
                  Gestao de identidade
                </button>
              ) : null}
            </div>
          </article>
        ) : null}

        {isIndividualLearningView ? (
          <article className="panel learner-results-panel">
            <p className="eyebrow">Meu desempenho</p>
            <h3>Resultados individuais</h3>
            {loadingOutcomes ? (
              <p className="support-text">Atualizando resultados...</p>
            ) : null}
            <ul className="result-list">
              {courses.map((course) => {
                const outcome = courseOutcomeById[course.id];
                return (
                  <li key={course.id}>
                    <div>
                      <h4>{course.title}</h4>
                      <p className="support-text">
                        Ultima tentativa:{" "}
                        {formatDateTime(outcome?.lastAttemptAt ?? null)}
                      </p>
                    </div>
                    <div className="result-meta">
                      <small
                        className={`badge ${
                          outcome?.statusLabel === "Aprovado"
                            ? "success-badge"
                            : outcome?.statusLabel === "Reprovado"
                              ? "danger"
                              : "neutral-badge"
                        }`}
                      >
                        {outcome?.statusLabel ?? "Nao iniciado"}
                      </small>
                      <span>Nota: {outcome?.scoreLabel ?? "--"}</span>
                      <span>Tentativas: {outcome?.attempts ?? 0}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </article>
        ) : null}

        {isIndividualLearningView && studySession ? (
          <article className="panel study-panel">
            <div className="study-topbar">
              <div>
                <p className="eyebrow">Modo estudo</p>
                <h3>{studySession.course.title}</h3>
                <p className="support-text">
                  {studySession.sequencingDetected
                    ? "Sequencing detectado: use a trilha lateral para percorrer o curso completo."
                    : "Percorra os itens do conteúdo pelo painel lateral."}
                </p>
                <p className="support-text">
                  Progresso geral:{" "}
                  {trailProgressByCourseId[studySession.course.id]
                    ?.overallProgress ?? 0}
                  %
                </p>
                {studyCompletionNotice ? (
                  <p className="support-text">{studyCompletionNotice}</p>
                ) : null}
              </div>

              <div className="study-topbar-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setStudySession(null)}
                >
                  Fechar estudo
                </button>
              </div>
            </div>

            <div className="study-layout">
              <aside className="study-sidebar">
                <h4>Trilha do curso</h4>
                {renderStudyOutline(
                  studySession.course,
                  studySession.outlineItems,
                )}
              </aside>

              <div className="study-player-area">
                <div className="study-player-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => navigateStudyItem(-1)}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => navigateStudyItem(1)}
                  >
                    Proximo
                  </button>
                </div>

                <ScormPlayer
                  className="study-player-frame"
                  courseId={studySession.course.id}
                  launchUrl={studySession.currentLaunchUrl}
                  token={session.token}
                  title={`SCORM ${studySession.course.title}`}
                  onRuntimeEvent={handleStudyRuntimeEvent}
                />
              </div>
            </div>
          </article>
        ) : null}

        {isAdminView && adminTab === "courses" ? (
          <>
            <CourseListPanel
              courses={courses}
              loading={loadingCourses}
              error={courseError}
              info={courseInfo}
              isManagementView
              canManageCourses={canManageCourses}
              uploadingCourseId={uploadingCourseId}
              loadingOutlineCourseId={loadingOutlineCourseId}
              outlineByCourseId={outlineByCourseId}
              onUploadScorm={(course, file) =>
                void handleUploadScormPackage(course, file)
              }
              onLaunchScorm={(course) => void handleLaunchScorm(course)}
              onLoadOutline={(course) => void handleLoadScormOutline(course)}
              onLaunchItem={handleLaunchOutlineItem}
              trailProgressByCourseId={trailProgressByCourseId}
              continueLaunchByCourseId={continueLaunchByCourseId}
              onContinueCourse={handleContinueCourse}
              onUpdateCourseSettings={handleUpdateCourseSettings}
            />

            <CreateCoursePanel
              form={courseForm}
              canManageCourses={canManageCourses}
              onSubmit={handleCreateCourse}
              onFormChange={setCourseForm}
            />
          </>
        ) : null}

        {isAdminView && adminTab === "identity" ? (
          <UsersPanel
            canManageUsers={canManageUsers}
            loading={loadingUsers}
            error={userError}
            users={users}
            form={userForm}
            onCreate={handleCreateUser}
            onFormChange={setUserForm}
            onRoleChange={(user, role) => void handleRoleChange(user, role)}
            onToggleActive={(user) => void handleToggleUserActive(user)}
            onDelete={(user) => void handleDeleteUser(user)}
          />
        ) : null}

        {isIndividualLearningView ? (
          <CourseListPanel
            courses={courses}
            loading={loadingCourses}
            error={courseError}
            info={courseInfo}
            isManagementView={false}
            canManageCourses={false}
            uploadingCourseId={null}
            loadingOutlineCourseId={null}
            outlineByCourseId={outlineByCourseId}
            onUploadScorm={(course, file) =>
              void handleUploadScormPackage(course, file)
            }
            onLaunchScorm={(course) => void handleLaunchScorm(course)}
            onLoadOutline={(course) => void handleLoadScormOutline(course)}
            onLaunchItem={handleLaunchOutlineItem}
            trailProgressByCourseId={trailProgressByCourseId}
            continueLaunchByCourseId={continueLaunchByCourseId}
            onContinueCourse={handleContinueCourse}
            onUpdateCourseSettings={handleUpdateCourseSettings}
          />
        ) : null}
      </section>
    </main>
  );
  // #endregion
}

export default App;
