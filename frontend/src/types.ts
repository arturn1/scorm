export type UserRole = "SUPER_ADMIN" | "TENANT_ADMIN" | "INSTRUCTOR" | "LEARNER";

export type Tenant = {
  id: string;
  name: string;
  slug: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export type AuthSession = {
  token: string;
  tenant: Tenant;
  user: User;
};

export type Course = {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  scormVersion: string;
  packagePath: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};
