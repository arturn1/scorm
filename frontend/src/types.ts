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
  isActive?: boolean;
};

export type TenantUser = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
  resumeMode: "LAST_POSITION" | "RESTART";
  allowRetake: boolean;
  reviewAfterCompletion: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ScormOutlineItem = {
  identifier: string | null;
  title: string;
  isVisible: boolean;
  launchUrl: string | null;
  children: ScormOutlineItem[];
};

export type ScormAttempt = {
  id: string;
  attemptNumber: number;
  status: "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
  completionStatus: string | null;
  successStatus: string | null;
  scoreRaw: number | null;
  scoreScaled: number | null;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScormTrailItemProgress = {
  progress: number;
  quizScore: number | null;
  successStatus: string | null;
  isQuiz: boolean;
  updatedAt: string | null;
};

export type ScormTrailProgress = {
  attemptId: string | null;
  overallProgress: number;
  totalItems: number;
  completedItems: number;
  averageQuizScore: number | null;
  items: Record<string, ScormTrailItemProgress>;
};

export type LoginFormState = {
  tenantSlug: string;
  email: string;
  password: string;
};

export type CourseFormState = {
  title: string;
  description: string;
};

export type UserFormState = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
};

export type StudyItem = {
  title: string;
  launchUrl: string;
};

export type StudySession = {
  course: Course;
  sequencingDetected: boolean;
  outlineItems: ScormOutlineItem[];
  playableItems: StudyItem[];
  currentLaunchUrl: string;
};

export type CourseOutcome = {
  statusLabel: "Aprovado" | "Reprovado" | "Em andamento" | "Nao iniciado";
  scoreLabel: string;
  attempts: number;
  lastAttemptAt: string | null;
};

export type AdminTab = "courses" | "identity";
