import { Router } from "express";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import {
  commitAttempt,
  getTrailProgressSummary,
  listAttempts,
  setRuntimeValue,
  startOrResumeScormAttempt,
  terminateAttempt,
} from "../services/scorm-runtime";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

export const scormRuntimeRouter = Router();

const startSchema = z.object({
  courseId: z.string().min(1),
});

const attemptParamsSchema = z.object({
  attemptId: z.string().min(1),
});

const runtimeValueSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

const attemptsQuerySchema = z.object({
  courseId: z.string().min(1),
  userId: z.string().optional(),
});

const trailProgressQuerySchema = z.object({
  courseId: z.string().min(1),
});

scormRuntimeRouter.use(requireAuth);

scormRuntimeRouter.post("/scorm-runtime/sessions/start", async (req, res, next) => {
  try {
    const input = startSchema.parse(req.body);

    const course = await prisma.course.findFirst({
      where: {
        id: input.courseId,
        tenantId: req.user!.tenantId,
      },
      select: {
        id: true,
        resumeMode: true,
        allowRetake: true,
        reviewAfterCompletion: true,
      },
    });

    if (!course) {
      res.status(404).json({ message: "Course not found for this tenant" });
      return;
    }

    const started = await startOrResumeScormAttempt({
      tenantId: req.user!.tenantId,
      userId: req.user!.id,
      courseId: input.courseId,
      resumeMode: course.resumeMode,
      allowRetake: course.allowRetake,
      reviewAfterCompletion: course.reviewAfterCompletion,
    });

    res.status(201).json({
      attempt: {
        id: started.attemptId,
        attemptNumber: started.attemptNumber,
      },
      runtimeValues: started.runtimeValues,
      readOnly: started.readOnly,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Course already completed and retake is disabled") {
      res.status(409).json({ message: error.message });
      return;
    }

    next(error);
  }
});

scormRuntimeRouter.post("/scorm-runtime/sessions/:attemptId/value", async (req, res, next) => {
  try {
    const { attemptId } = attemptParamsSchema.parse(req.params);
    const input = runtimeValueSchema.parse(req.body);

    const attempt = await prisma.scormAttempt.findFirst({
      where: {
        id: attemptId,
        tenantId: req.user!.tenantId,
        userId: req.user!.id,
      },
      select: { id: true },
    });

    if (!attempt) {
      res.status(404).json({ message: "Attempt not found" });
      return;
    }

    await setRuntimeValue({
      attemptId,
      key: input.key,
      value: input.value,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

scormRuntimeRouter.post("/scorm-runtime/sessions/:attemptId/commit", async (req, res, next) => {
  try {
    const { attemptId } = attemptParamsSchema.parse(req.params);

    await commitAttempt({
      attemptId,
      tenantId: req.user!.tenantId,
      userId: req.user!.id,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

scormRuntimeRouter.post("/scorm-runtime/sessions/:attemptId/terminate", async (req, res, next) => {
  try {
    const { attemptId } = attemptParamsSchema.parse(req.params);

    await terminateAttempt({
      attemptId,
      tenantId: req.user!.tenantId,
      userId: req.user!.id,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

scormRuntimeRouter.get("/scorm-runtime/attempts", async (req, res, next) => {
  try {
    const query = attemptsQuerySchema.parse(req.query);
    const requestedUserId = query.userId;
    const isManagementRole =
      req.user!.role === UserRole.TENANT_ADMIN || req.user!.role === UserRole.INSTRUCTOR;

    if (requestedUserId && requestedUserId !== req.user!.id && !isManagementRole) {
      res.status(403).json({ message: "You can only view your own attempts" });
      return;
    }

    const userId = requestedUserId && isManagementRole ? requestedUserId : req.user!.id;

    const attempts = await listAttempts({
      tenantId: req.user!.tenantId,
      userId,
      courseId: query.courseId,
    });

    res.json({ items: attempts });
  } catch (error) {
    next(error);
  }
});

scormRuntimeRouter.get("/scorm-runtime/trail-progress", async (req, res, next) => {
  try {
    const query = trailProgressQuerySchema.parse(req.query);

    const course = await prisma.course.findFirst({
      where: {
        id: query.courseId,
        tenantId: req.user!.tenantId,
      },
      select: { id: true },
    });

    if (!course) {
      res.status(404).json({ message: "Course not found for this tenant" });
      return;
    }

    const summary = await getTrailProgressSummary({
      tenantId: req.user!.tenantId,
      userId: req.user!.id,
      courseId: query.courseId,
    });

    res.json(summary);
  } catch (error) {
    next(error);
  }
});
