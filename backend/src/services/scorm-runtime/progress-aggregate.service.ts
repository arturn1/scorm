import { EnrollmentStatus, Prisma, ScormAttemptStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { getScormOutline } from "../scorm-content";
import { clampProgress, computeOverallProgressFromRuntimeValues, normalizeLaunchIdentifier, normalizeRuntimeScore } from "./runtime-helpers";
import type { TrailProgressItem } from "./types";

export async function updateEnrollmentAggregate(params: {
  tx: Prisma.TransactionClient;
  tenantId: string;
  userId: string;
  courseId: string;
}): Promise<void> {
  const attempts = await params.tx.scormAttempt.findMany({
    where: {
      tenantId: params.tenantId,
      userId: params.userId,
      courseId: params.courseId,
    },
    select: {
      status: true,
      completionStatus: true,
      scoreRaw: true,
      scoreScaled: true,
      endedAt: true,
    },
  });

  const attemptsCount = attempts.length;
  const latestAttempt = await params.tx.scormAttempt.findFirst({
    where: {
      tenantId: params.tenantId,
      userId: params.userId,
      courseId: params.courseId,
    },
    orderBy: { attemptNumber: "desc" },
    include: { runtimeValues: true, itemStates: true },
  });

  const outline = await getScormOutline({ tenantId: params.tenantId, courseId: params.courseId });
  const latestProgress = latestAttempt
    ? computeOverallProgressFromRuntimeValues({
        outlineItems: outline.items,
        itemStates: latestAttempt.itemStates,
        runtimeValues: latestAttempt.runtimeValues,
      })
    : 0;

  const hasCompleted = latestProgress >= 100;
  const hasInProgress = attempts.some((attempt) => attempt.status === ScormAttemptStatus.IN_PROGRESS) || latestProgress > 0;

  const normalizedScores = attempts
    .map((attempt) => {
      if (attempt.scoreScaled !== null) {
        return attempt.scoreScaled * 100;
      }
      if (attempt.scoreRaw !== null) {
        return attempt.scoreRaw;
      }
      return null;
    })
    .filter((score): score is number => score !== null);

  const bestScore = normalizedScores.length ? Math.max(...normalizedScores) : null;

  const status = hasCompleted
    ? EnrollmentStatus.COMPLETED
    : hasInProgress
      ? EnrollmentStatus.IN_PROGRESS
      : EnrollmentStatus.NOT_STARTED;

  const progress = status === EnrollmentStatus.COMPLETED ? 100 : status === EnrollmentStatus.IN_PROGRESS ? latestProgress || 50 : 0;
  const completedAt = hasCompleted ? new Date() : null;

  await params.tx.enrollment.upsert({
    where: {
      userId_courseId: {
        userId: params.userId,
        courseId: params.courseId,
      },
    },
    create: {
      tenantId: params.tenantId,
      userId: params.userId,
      courseId: params.courseId,
      attempts: attemptsCount,
      status,
      progress,
      score: bestScore,
      completedAt,
    },
    update: {
      attempts: attemptsCount,
      status,
      progress,
      score: bestScore,
      completedAt,
    },
  });
}

export async function getTrailProgressSummary(params: {
  tenantId: string;
  userId: string;
  courseId: string;
}): Promise<{
  attemptId: string | null;
  overallProgress: number;
  totalItems: number;
  completedItems: number;
  averageQuizScore: number | null;
  items: Record<string, TrailProgressItem>;
}> {
  const attempt = await prisma.scormAttempt.findFirst({
    where: {
      tenantId: params.tenantId,
      userId: params.userId,
      courseId: params.courseId,
    },
    orderBy: { attemptNumber: "desc" },
    include: { runtimeValues: true, itemStates: true },
  });

  if (!attempt) {
    return {
      attemptId: null,
      overallProgress: 0,
      totalItems: 0,
      completedItems: 0,
      averageQuizScore: null,
      items: {},
    };
  }

  const outline = await getScormOutline({ tenantId: params.tenantId, courseId: params.courseId });
  const launchIdentifiers = new Set<string>();

  const visit = (item: { launchPath: string | null; children: Array<any> }) => {
    if (item.launchPath) {
      launchIdentifiers.add(normalizeLaunchIdentifier(item.launchPath));
    }
    for (const child of item.children ?? []) {
      visit(child);
    }
  };

  for (const item of outline.items) {
    visit(item);
  }

  const items: Record<string, TrailProgressItem> = {};
  const progressByIdentifier = new Map<string, number>();

  for (const identifier of launchIdentifiers) {
    progressByIdentifier.set(identifier, 0);
  }

  if (attempt.itemStates.length) {
    for (const state of attempt.itemStates) {
      const launchUrl = state.launchUrl;

      items[launchUrl] = {
        progress: clampProgress(state.progress),
        quizScore: state.quizScore !== null ? clampProgress(state.quizScore) : null,
        successStatus: state.successStatus,
        isQuiz: state.isQuiz,
        updatedAt: state.updatedAt.toISOString(),
      };

      progressByIdentifier.set(state.itemKey, clampProgress(state.progress));
    }
  }

  for (const entry of attempt.runtimeValues) {
    if (attempt.itemStates.length) {
      break;
    }
    if (!entry.key.startsWith("__item.")) {
      continue;
    }

    const [prefix, encodedLaunchUrl] = entry.key.split("::");
    if (!prefix || !encodedLaunchUrl) {
      continue;
    }

    let launchUrl: string;
    try {
      launchUrl = decodeURIComponent(encodedLaunchUrl);
    } catch {
      continue;
    }

    const normalizedIdentifier = normalizeLaunchIdentifier(launchUrl);

    if (!items[launchUrl]) {
      items[launchUrl] = {
        progress: 0,
        quizScore: null,
        successStatus: null,
        isQuiz: false,
        updatedAt: null,
      };
    }

    const updatedAtIso = entry.updatedAt.toISOString();
    if (!items[launchUrl]!.updatedAt || updatedAtIso > items[launchUrl]!.updatedAt!) {
      items[launchUrl]!.updatedAt = updatedAtIso;
    }

    if (prefix === "__item.progress") {
      const parsed = Number(entry.value);
      if (Number.isFinite(parsed)) {
        const clamped = clampProgress(parsed);
        items[launchUrl]!.progress = clamped;
        progressByIdentifier.set(normalizedIdentifier, clamped);
      }
      continue;
    }

    if (prefix === "__item.score") {
      items[launchUrl]!.quizScore = normalizeRuntimeScore(entry.value);
      continue;
    }

    if (prefix === "__item.success") {
      items[launchUrl]!.successStatus = entry.value || null;
      continue;
    }

    if (prefix === "__item.isQuiz") {
      items[launchUrl]!.isQuiz = entry.value === "1";
    }
  }

  const progressValues = launchIdentifiers.size
    ? Array.from(progressByIdentifier.values())
    : Object.values(items).map((item) => item.progress);

  const overallProgress = progressValues.length
    ? clampProgress(progressValues.reduce((acc, value) => acc + value, 0) / progressValues.length)
    : 0;

  const completedItems = progressValues.filter((value) => value >= 100).length;
  const quizScores = Object.values(items)
    .filter((item) => item.isQuiz && item.quizScore !== null)
    .map((item) => item.quizScore as number);
  const averageQuizScore = quizScores.length
    ? clampProgress(quizScores.reduce((acc, value) => acc + value, 0) / quizScores.length)
    : null;

  return {
    attemptId: attempt.id,
    overallProgress,
    totalItems: progressValues.length,
    completedItems,
    averageQuizScore,
    items,
  };
}
