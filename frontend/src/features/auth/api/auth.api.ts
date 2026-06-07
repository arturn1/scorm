import type { AuthSession } from "../../../types";
import { apiPost } from "../../../shared/api/http-client";

type LoginPayload = {
  tenantSlug: string;
  email: string;
  password: string;
};

export async function login(payload: LoginPayload): Promise<AuthSession> {
  return apiPost<AuthSession, LoginPayload>("/auth/login", payload);
}
