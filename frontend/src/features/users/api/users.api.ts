import type { TenantUser, UserRole } from "../../../types";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../../shared/api/http-client";

type CreateUserPayload = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  isActive?: boolean;
};

type UpdateUserPayload = {
  name?: string;
  role?: UserRole;
  isActive?: boolean;
  password?: string;
};

export async function getUsers(token: string): Promise<TenantUser[]> {
  const data = await apiGet<{ items: TenantUser[] }>("/users", token);
  return data.items;
}

export async function createUser(
  token: string,
  payload: CreateUserPayload,
): Promise<TenantUser> {
  const data = await apiPost<{ item: TenantUser }, CreateUserPayload>("/users", payload, token);
  return data.item;
}

export async function updateUser(
  token: string,
  userId: string,
  payload: UpdateUserPayload,
): Promise<TenantUser> {
  const data = await apiPatch<{ item: TenantUser }, UpdateUserPayload>(
    `/users/${userId}`,
    payload,
    token,
  );
  return data.item;
}

export async function deleteUser(token: string, userId: string): Promise<void> {
  await apiDelete(`/users/${userId}`, token);
}
