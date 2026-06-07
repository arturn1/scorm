const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3333/api";

type ErrorResponse = { message?: string };

async function readResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T | ErrorResponse;

  if (!response.ok) {
    throw new Error((data as ErrorResponse).message ?? "Request failed");
  }

  return data as T;
}

export async function apiGet<T>(path: string, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
  });

  return readResponse<T>(response);
}

export async function apiPost<TResponse, TPayload>(
  path: string,
  payload: TPayload,
  token?: string,
): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  return readResponse<TResponse>(response);
}

export async function apiPatch<TResponse, TPayload>(
  path: string,
  payload: TPayload,
  token: string,
): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  return readResponse<TResponse>(response);
}

export async function apiDelete(path: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 204) {
    return;
  }

  await readResponse<{ ok: true }>(response);
}
