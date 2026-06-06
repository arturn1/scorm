import { UserRole } from "@prisma/client";

export type AuthTokenPayload = {
  sub: string;
  tenantId: string;
  role: UserRole;
  email: string;
};

export type AuthUser = {
  id: string;
  tenantId: string;
  role: UserRole;
  email: string;
};
