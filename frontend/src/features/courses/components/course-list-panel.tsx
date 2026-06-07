import { useState } from "react";
import type { Course, ScormOutlineItem, ScormTrailProgress } from "../../../types";

type CourseListPanelProps = {
  courses: Course[];
  loading: boolean;
  error: string | null;
  info: string | null;
  isManagementView: boolean;
  canManageCourses: boolean;
  uploadingCourseId: string | null;
  loadingOutlineCourseId: string | null;
  outlineByCourseId: Record<string, { sequencingDetected: boolean; items: ScormOutlineItem[] } | undefined>;
  onUploadScorm: (course: Course, file: File) => void;
  onLaunchScorm: (course: Course) => void;
  onLoadOutline: (course: Course) => void;
  onLaunchItem: (course: Course, launchUrl: string) => void;
  trailProgressByCourseId?: Record<string, ScormTrailProgress | undefined>;
  continueLaunchByCourseId?: Record<string, string | undefined>;
  onContinueCourse?: (course: Course, launchUrl: string) => void;
  onUpdateCourseSettings?: (
    course: Course,
    payload: {
      resumeMode?: "LAST_POSITION" | "RESTART";
      allowRetake?: boolean;
      reviewAfterCompletion?: boolean;
    },
  ) => void;
};

function renderOutlineItems(
  course: Course,
  items: ScormOutlineItem[],
  isManagementView: boolean,
  onLaunchItem: (course: Course, launchUrl: string) => void,
) {
  return (
    <ul className="outline-list">
      {items.map((item, index) => (
        <li key={`${item.identifier ?? item.title}-${index}`}>
          <div className="outline-row">
            <span>{item.title}</span>
            {item.launchUrl ? (
              <button
                type="button"
                className="ghost"
                onClick={() => onLaunchItem(course, item.launchUrl!)}
              >
                {isManagementView ? "Pre-visualizar item" : "Estudar item"}
              </button>
            ) : null}
          </div>
          {item.children.length
            ? renderOutlineItems(course, item.children, isManagementView, onLaunchItem)
            : null}
        </li>
      ))}
    </ul>
  );
}

export function CourseListPanel({
  courses,
  loading,
  error,
  info,
  isManagementView,
  canManageCourses,
  uploadingCourseId,
  loadingOutlineCourseId,
  outlineByCourseId,
  onUploadScorm,
  onLaunchScorm,
  onLoadOutline,
  onLaunchItem,
  trailProgressByCourseId,
  continueLaunchByCourseId,
  onContinueCourse,
  onUpdateCourseSettings,
}: CourseListPanelProps) {
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [manifestOpenByCourseId, setManifestOpenByCourseId] = useState<Record<string, boolean>>({});

  const toggleCourseExpansion = (courseId: string) => {
    setExpandedCourseId((previous) => (previous === courseId ? null : courseId));
  };

  const toggleManifest = (course: Course) => {
    const isOpen = manifestOpenByCourseId[course.id] ?? false;
    const nextOpen = !isOpen;

    setManifestOpenByCourseId((previous) => ({
      ...previous,
      [course.id]: nextOpen,
    }));

    if (nextOpen && !outlineByCourseId[course.id]) {
      onLoadOutline(course);
    }
  };

  return (
    <article className="panel">
      <h3>Cursos do tenant</h3>
      {loading ? <p className="support-text">Carregando cursos...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {!error && info ? <p className="support-text">{info}</p> : null}

      <ul className="course-list">
        {courses.map((course) => {
          const hasScorm = Boolean(course.packagePath);

          return (
          <li key={course.id}>
            <div className="course-card-header">
              <div>
                <h4>{course.title}</h4>
                <small className={hasScorm ? "scorm-status ok" : "scorm-status missing"}>
                  {hasScorm
                    ? `SCORM associado (${course.scormVersion})`
                    : "Sem SCORM associado"}
                </small>
              </div>

              {isManagementView ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => toggleCourseExpansion(course.id)}
                >
                  {expandedCourseId === course.id ? "Recolher" : "Expandir"}
                </button>
              ) : null}
            </div>

            {!isManagementView || expandedCourseId === course.id ? (
              <>
                <p>{course.description ?? "Sem descricao"}</p>

                {isManagementView && !hasScorm ? (
                  <p className="support-text">
                    Este curso ainda nao possui pacote SCORM. Envie um arquivo .zip para habilitar
                    pre-visualizacao, manifest e consumo dos alunos.
                  </p>
                ) : null}

                {isManagementView ? (
                  <div className="course-settings-box">
                    <label>
                      Modo de retomada
                      <select
                        value={course.resumeMode}
                        onChange={(event) =>
                          onUpdateCourseSettings?.(course, {
                            resumeMode: event.target.value as "LAST_POSITION" | "RESTART",
                          })
                        }
                      >
                        <option value="LAST_POSITION">Continuar da ultima posicao</option>
                        <option value="RESTART">Reiniciar nova tentativa</option>
                      </select>
                    </label>

                    <label className="inline-toggle">
                      <input
                        type="checkbox"
                        checked={course.allowRetake}
                        onChange={(event) =>
                          onUpdateCourseSettings?.(course, {
                            allowRetake: event.target.checked,
                          })
                        }
                      />
                      Permitir nova tentativa apos conclusao
                    </label>

                    <label className="inline-toggle">
                      <input
                        type="checkbox"
                        checked={course.reviewAfterCompletion}
                        onChange={(event) =>
                          onUpdateCourseSettings?.(course, {
                            reviewAfterCompletion: event.target.checked,
                          })
                        }
                      />
                      Permitir modo revisao quando retake estiver desabilitado
                    </label>
                  </div>
                ) : null}

                <div className="course-actions">
                  {hasScorm ? (
                    <button type="button" className="ghost" onClick={() => onLaunchScorm(course)}>
                      {isManagementView ? "Pre-visualizar curso" : "Estudar curso"}
                    </button>
                  ) : (
                    <small>Pacote SCORM nao enviado</small>
                  )}

                  {canManageCourses ? (
                    <label className="upload-label">
                      <input
                        type="file"
                        accept=".zip,application/zip"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) {
                            return;
                          }
                          onUploadScorm(course, file);
                          event.currentTarget.value = "";
                        }}
                      />
                      {uploadingCourseId === course.id ? "Enviando..." : "Upload pacote SCORM"}
                    </label>
                  ) : null}

                  {hasScorm ? (
                    <button type="button" className="ghost" onClick={() => toggleManifest(course)}>
                      {(manifestOpenByCourseId[course.id] ?? false)
                        ? "Ocultar itens do manifest"
                        : "Ver itens do manifest"}
                    </button>
                  ) : null}

                  {!isManagementView &&
                  hasScorm &&
                  onContinueCourse &&
                  continueLaunchByCourseId?.[course.id] ? (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => onContinueCourse(course, continueLaunchByCourseId[course.id]!)}
                    >
                      Continuar de onde parou
                    </button>
                  ) : null}
                </div>

                {!isManagementView && trailProgressByCourseId?.[course.id] ? (
                  <p className="support-text">
                    Progresso atual: {trailProgressByCourseId[course.id]!.overallProgress}%
                  </p>
                ) : null}

                {(manifestOpenByCourseId[course.id] ?? false) ? (
                  <div className="outline-box">
                    {loadingOutlineCourseId === course.id ? (
                      <p className="support-text">Carregando itens do manifest...</p>
                    ) : null}

                    {outlineByCourseId[course.id]?.sequencingDetected ? (
                      <p className="support-text">
                        Sequencing SCORM 2004 detectado: exibindo itens do manifest para navegacao manual.
                      </p>
                    ) : null}

                    {outlineByCourseId[course.id]
                      ? renderOutlineItems(
                          course,
                          outlineByCourseId[course.id]!.items,
                          isManagementView,
                          onLaunchItem,
                        )
                      : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </li>
          );
        })}
        {!courses.length && !loading ? (
          <li>
            <p>Nenhum curso cadastrado ainda.</p>
          </li>
        ) : null}
      </ul>
    </article>
  );
}
