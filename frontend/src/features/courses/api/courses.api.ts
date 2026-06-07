import type { Course, ScormAttempt, ScormOutlineItem, ScormTrailProgress } from "../../../types";
import { apiGet, apiPatch, apiPost } from "../../../shared/api/http-client";

type CreateCoursePayload = {
  title: string;
  description?: string;
  resumeMode?: "LAST_POSITION" | "RESTART";
  allowRetake?: boolean;
  reviewAfterCompletion?: boolean;
};

type UpdateCourseSettingsPayload = {
  resumeMode?: "LAST_POSITION" | "RESTART";
  allowRetake?: boolean;
  reviewAfterCompletion?: boolean;
};

export type UploadScormResult = {
  item: Course;
  detectedScormVersion: string;
};

export async function getCourses(token: string): Promise<Course[]> {
  const data = await apiGet<{ items: Course[] }>("/courses", token);
  return data.items;
}

export async function createCourse(
  token: string,
  payload: CreateCoursePayload,
): Promise<Course> {
  const data = await apiPost<{ item: Course }, CreateCoursePayload>("/courses", payload, token);
  return data.item;
}

export async function uploadScormPackage(
  token: string,
  courseId: string,
  file: File,
): Promise<UploadScormResult> {
  const formData = new FormData();
  formData.append("package", file);

  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3333/api"}/courses/${courseId}/scorm-package`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    },
  );

  const data = (await response.json()) as {
    item?: Course;
    detectedScormVersion?: string;
    message?: string;
  };

  if (!response.ok || !data.item || !data.detectedScormVersion) {
    throw new Error(data.message ?? "Falha ao enviar pacote SCORM");
  }

  return {
    item: data.item,
    detectedScormVersion: data.detectedScormVersion,
  };
}

export async function getScormLaunchUrl(token: string, courseId: string): Promise<string> {
  const data = await apiGet<{ launchUrl: string }>(`/courses/${courseId}/scorm-launch`, token);
  return data.launchUrl;
}

export async function getScormOutline(
  token: string,
  courseId: string,
): Promise<{ sequencingDetected: boolean; items: ScormOutlineItem[] }> {
  return apiGet<{ sequencingDetected: boolean; items: ScormOutlineItem[] }>(
    `/courses/${courseId}/scorm-outline`,
    token,
  );
}

export async function getScormAttempts(token: string, courseId: string): Promise<ScormAttempt[]> {
  const data = await apiGet<{ items: ScormAttempt[] }>(
    `/scorm-runtime/attempts?courseId=${encodeURIComponent(courseId)}`,
    token,
  );

  return data.items;
}

export async function getScormTrailProgress(
  token: string,
  courseId: string,
): Promise<ScormTrailProgress> {
  return apiGet<ScormTrailProgress>(
    `/scorm-runtime/trail-progress?courseId=${encodeURIComponent(courseId)}`,
    token,
  );
}

export async function updateCourseSettings(
  token: string,
  courseId: string,
  payload: UpdateCourseSettingsPayload,
): Promise<Course> {
  const data = await apiPatch<{ item: Course }, UpdateCourseSettingsPayload>(
    `/courses/${courseId}/settings`,
    payload,
    token,
  );

  return data.item;
}
