import { CourseResumeMode, Prisma, ScormAttemptStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { getScormOutline } from "../scorm-content";
import {
  clampProgress,
  computeOverallProgressFromRuntimeValues,
  deriveAttemptStatus,
  normalizeRuntimeScore,
  parseItemRuntimeKey,
} from "./runtime-helpers";
import { updateEnrollmentAggregate } from "./progress-aggregate.service";

export async function startOrResumeScormAttempt(params: {
  tenantId: string;
  userId: string;
  courseId: string;
  resumeMode: CourseResumeMode;
  allowRetake: boolean;
  reviewAfterCompletion: boolean;
}): Promise<{
  attemptId: string;
  attemptNumber: number;
  runtimeValues: Record<string, string>;
  readOnly: boolean;
}> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.scormAttempt.findFirst({
      where: {
        tenantId: params.tenantId,
        userId: params.userId,
        courseId: params.courseId,
        status: ScormAttemptStatus.IN_PROGRESS,
      },
      orderBy: { attemptNumber: "desc" },
      include: { runtimeValues: true },
    });

    if (existing) {
      const runtimeValues = Object.fromEntries(existing.runtimeValues.map((entry) => [entry.key, entry.value]));
      return {
        attemptId: existing.id,
        attemptNumber: existing.attemptNumber,
        runtimeValues,
        readOnly: false,
      };
    }

    const latest = await tx.scormAttempt.findFirst({
      where: {
        tenantId: params.tenantId,
        userId: params.userId,
        courseId: params.courseId,
      },
      orderBy: { attemptNumber: "desc" },
      include: { runtimeValues: true },
    });

    if (latest?.status === ScormAttemptStatus.COMPLETED) {
      if (params.allowRetake) {
        const attempt = await tx.scormAttempt.create({
          data: {
            tenantId: params.tenantId,
            userId: params.userId,
            courseId: params.courseId,
            attemptNumber: latest.attemptNumber + 1,
            status: ScormAttemptStatus.IN_PROGRESS,
          },
        });

        await updateEnrollmentAggregate({
          tx,
          tenantId: params.tenantId,
          userId: params.userId,
          courseId: params.courseId,
        });

        return {
          attemptId: attempt.id,
          attemptNumber: attempt.attemptNumber,
          runtimeValues: {},
          readOnly: false,
        };
      }

      if (params.reviewAfterCompletion) {
        const runtimeValues = Object.fromEntries(
          latest.runtimeValues.map((entry) => [entry.key, entry.value]),
        );

        return {
          attemptId: latest.id,
          attemptNumber: latest.attemptNumber,
          runtimeValues,
          readOnly: true,
        };
      }

      throw new Error("Course already completed and retake is disabled");
    }

    if (latest?.status === ScormAttemptStatus.ABANDONED) {
      if (params.resumeMode === CourseResumeMode.LAST_POSITION) {
        const reopened = await tx.scormAttempt.update({
          where: { id: latest.id },
          data: {
            status: ScormAttemptStatus.IN_PROGRESS,
            endedAt: null,
          },
          include: { runtimeValues: true },
        });

        const runtimeValues = Object.fromEntries(
          reopened.runtimeValues.map((entry) => [entry.key, entry.value]),
        );

        return {
          attemptId: reopened.id,
          attemptNumber: reopened.attemptNumber,
          runtimeValues,
          readOnly: false,
        };
      }

      const restartAttempt = await tx.scormAttempt.create({
        data: {
          tenantId: params.tenantId,
          userId: params.userId,
          courseId: params.courseId,
          attemptNumber: latest.attemptNumber + 1,
          status: ScormAttemptStatus.IN_PROGRESS,
        },
      });

      await updateEnrollmentAggregate({
        tx,
        tenantId: params.tenantId,
        userId: params.userId,
        courseId: params.courseId,
      });

      return {
        attemptId: restartAttempt.id,
        attemptNumber: restartAttempt.attemptNumber,
        runtimeValues: {},
        readOnly: false,
      };
    }

    const attempt = await tx.scormAttempt.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        courseId: params.courseId,
        attemptNumber: (latest?.attemptNumber ?? 0) + 1,
        status: ScormAttemptStatus.IN_PROGRESS,
      },
    });

    await updateEnrollmentAggregate({
      tx,
      tenantId: params.tenantId,
      userId: params.userId,
      courseId: params.courseId,
    });

    return {
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      runtimeValues: {},
      readOnly: false,
    };
  });
}

export async function setRuntimeValue(params: {
  attemptId: string;
  key: string;
  value: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.scormRuntimeValue.upsert({
      where: {
        attemptId_key: {
          attemptId: params.attemptId,
          key: params.key,
        },
      },
      create: {
        attemptId: params.attemptId,
        key: params.key,
        value: params.value,
      },
      update: {
        value: params.value,
      },
    });

    const parsed = parseItemRuntimeKey(params.key);
    if (!parsed || !parsed.itemKey) {
      return;
    }

    const createData: Prisma.ScormAttemptItemStateCreateInput = {
      attempt: { connect: { id: params.attemptId } },
      itemKey: parsed.itemKey,
      launchUrl: parsed.launchUrl,
      progress: 0,
      isQuiz: false,
    };

    const updateData: Prisma.ScormAttemptItemStateUpdateInput = {
      launchUrl: parsed.launchUrl,
    };

    if (parsed.metric === "progress") {
      const value = Number(params.value);
      if (Number.isFinite(value)) {
        createData.progress = clampProgress(value);
        updateData.progress = clampProgress(value);
      }
    }

    if (parsed.metric === "score") {
      const score = normalizeRuntimeScore(params.value);
      if (score !== null) {
        createData.quizScore = score;
        updateData.quizScore = score;
      }
    }

    if (parsed.metric === "success") {
      createData.successStatus = params.value || null;
      updateData.successStatus = params.value || null;
    }

    if (parsed.metric === "completion") {
      createData.completionStatus = params.value || null;
      updateData.completionStatus = params.value || null;
    }

    if (parsed.metric === "location") {
      createData.location = params.value || null;
      updateData.location = params.value || null;
    }

    if (parsed.metric === "isQuiz") {
      const isQuiz = params.value === "1";
      createData.isQuiz = isQuiz;
      updateData.isQuiz = isQuiz;
    }

    await tx.scormAttemptItemState.upsert({
      where: {
        attemptId_itemKey: {
          attemptId: params.attemptId,
          itemKey: parsed.itemKey,
        },
      },
      create: createData,
      update: updateData,
    });
  });
}

export async function commitAttempt(params: {
  attemptId: string;
  tenantId: string;
  userId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const attempt = await tx.scormAttempt.findFirst({
      where: {
        id: params.attemptId,
        tenantId: params.tenantId,
        userId: params.userId,
      },
      include: { runtimeValues: true, itemStates: true },
    });

    if (!attempt) {
      throw new Error("Attempt not found");
    }

    const runtimeMap = Object.fromEntries(attempt.runtimeValues.map((entry) => [entry.key, entry.value]));
    const derived = deriveAttemptStatus(runtimeMap);
    const outline = await getScormOutline({ tenantId: attempt.tenantId, courseId: attempt.courseId });
    const overallProgress = computeOverallProgressFromRuntimeValues({
      outlineItems: outline.items,
      itemStates: attempt.itemStates,
      runtimeValues: attempt.runtimeValues,
    });

    await tx.scormAttempt.update({
      where: { id: attempt.id },
      data: {
        status: overallProgress >= 100 ? ScormAttemptStatus.COMPLETED : ScormAttemptStatus.IN_PROGRESS,
        completionStatus: derived.completionStatus,
        successStatus: derived.successStatus,
        scoreRaw: derived.scoreRaw,
        scoreScaled: derived.scoreScaled,
      },
    });

    await updateEnrollmentAggregate({
      tx,
      tenantId: attempt.tenantId,
      userId: attempt.userId,
      courseId: attempt.courseId,
    });
  });
}

export async function terminateAttempt(params: {
  attemptId: string;
  tenantId: string;
  userId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const attempt = await tx.scormAttempt.findFirst({
      where: {
        id: params.attemptId,
        tenantId: params.tenantId,
        userId: params.userId,
      },
      include: { runtimeValues: true, itemStates: true },
    });

    if (!attempt) {
      throw new Error("Attempt not found");
    }

    const runtimeMap = Object.fromEntries(attempt.runtimeValues.map((entry) => [entry.key, entry.value]));
    const derived = deriveAttemptStatus(runtimeMap);
    const outline = await getScormOutline({ tenantId: attempt.tenantId, courseId: attempt.courseId });
    const overallProgress = computeOverallProgressFromRuntimeValues({
      outlineItems: outline.items,
      itemStates: attempt.itemStates,
      runtimeValues: attempt.runtimeValues,
    });

    await tx.scormAttempt.update({
      where: { id: attempt.id },
      data: {
        status: overallProgress >= 100 ? ScormAttemptStatus.COMPLETED : ScormAttemptStatus.ABANDONED,
        completionStatus: derived.completionStatus,
        successStatus: derived.successStatus,
        scoreRaw: derived.scoreRaw,
        scoreScaled: derived.scoreScaled,
        endedAt: new Date(),
      },
    });

    await updateEnrollmentAggregate({
      tx,
      tenantId: attempt.tenantId,
      userId: attempt.userId,
      courseId: attempt.courseId,
    });
  });
}

export async function listAttempts(params: {
  tenantId: string;
  userId: string;
  courseId: string;
}) {
  return prisma.scormAttempt.findMany({
    where: {
      tenantId: params.tenantId,
      userId: params.userId,
      courseId: params.courseId,
    },
    orderBy: { attemptNumber: "desc" },
    select: {
      id: true,
      attemptNumber: true,
      status: true,
      completionStatus: true,
      successStatus: true,
      scoreRaw: true,
      scoreScaled: true,
      startedAt: true,
      endedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
