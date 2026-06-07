import type { FormEvent } from "react";

type CourseFormState = {
  title: string;
  description: string;
};

type CreateCoursePanelProps = {
  form: CourseFormState;
  canManageCourses: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFormChange: (next: CourseFormState) => void;
};

export function CreateCoursePanel({
  form,
  canManageCourses,
  onSubmit,
  onFormChange,
}: CreateCoursePanelProps) {
  return (
    <article className="panel">
      <h3>Novo curso</h3>
      {canManageCourses ? (
        <form className="form-grid" onSubmit={onSubmit}>
          <label>
            Titulo
            <input
              value={form.title}
              onChange={(event) => onFormChange({ ...form, title: event.target.value })}
              required
            />
          </label>

          <label>
            Descricao
            <textarea
              value={form.description}
              onChange={(event) => onFormChange({ ...form, description: event.target.value })}
            />
          </label>

          <button type="submit">Criar curso</button>
        </form>
      ) : (
        <p className="support-text">Seu perfil nao tem permissao para criar cursos neste tenant.</p>
      )}
    </article>
  );
}
