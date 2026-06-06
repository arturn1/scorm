import type { AuthSession, Course } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3333/api";

type LoginPayload = {
  tenantSlug: string;
  email: string;
  password: string;
};

type CreateCoursePayload = {
  title: string;
  description?: string;
};

async function handleResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T | { message?: string };
  if (!response.ok) {
    const message = (data as { message?: string }).message ?? "Request failed";
    throw new Error(message);
  }
  return data as T;
}

export async function login(payload: LoginPayload): Promise<AuthSession> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<AuthSession>(response);
}

export async function getCourses(token: string): Promise<Course[]> {
  const response = await fetch(`${API_BASE_URL}/courses`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await handleResponse<{ items: Course[] }>(response);
  return data.items;
}

export async function createCourse(
  token: string,
  payload: CreateCoursePayload,
): Promise<Course> {
  const response = await fetch(`${API_BASE_URL}/courses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await handleResponse<{ item: Course }>(response);
  return data.item;
}
