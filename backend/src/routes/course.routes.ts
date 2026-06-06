import { EnrollmentStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

export const courseRouter = Router();

const createCourseSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  packagePath: z.string().optional(),
  isPublished: z.boolean().optional(),
});

const enrollParamsSchema = z.object({
  courseId: z.string().min(1),
  userId: z.string().min(1),
});

courseRouter.use(requireAuth);

courseRouter.get("/courses", async (req, res, next) => {
  try {
    const courses = await prisma.course.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { createdAt: "desc" },
    });

    res.json({ items: courses });
  } catch (error) {
    next(error);
  }
});

courseRouter.post(
  "/courses",
  requireRole(UserRole.TENANT_ADMIN, UserRole.INSTRUCTOR),
  async (req, res, next) => {
    try {
      const input = createCourseSchema.parse(req.body);

      const course = await prisma.course.create({
        data: {
          tenantId: req.user!.tenantId,
          title: input.title,
          description: input.description ?? null,
          packagePath: input.packagePath ?? null,
          isPublished: input.isPublished ?? false,
        },
      });

      res.status(201).json({ item: course });
    } catch (error) {
      next(error);
    }
  },
);

courseRouter.post(
  "/courses/:courseId/enroll/:userId",
  requireRole(UserRole.TENANT_ADMIN),
  async (req, res, next) => {
    try {
      const { courseId, userId } = enrollParamsSchema.parse(req.params);

      const [course, user] = await Promise.all([
        prisma.course.findFirst({
          where: { id: courseId, tenantId: req.user!.tenantId },
        }),
        prisma.user.findFirst({
          where: { id: userId, tenantId: req.user!.tenantId },
        }),
      ]);

      if (!course || !user) {
        res.status(404).json({ message: "Course or user not found for this tenant" });
        return;
      }

      const enrollment = await prisma.enrollment.upsert({
        where: {
          userId_courseId: {
            userId,
            courseId,
          },
        },
        update: {},
        create: {
          tenantId: req.user!.tenantId,
          userId,
          courseId,
          status: EnrollmentStatus.NOT_STARTED,
        },
      });

      res.status(201).json({ item: enrollment });
    } catch (error) {
      next(error);
    }
  },
);
