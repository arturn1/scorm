import { EnrollmentStatus, UserRole } from "@prisma/client";
import { promises as fs } from "node:fs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { buildScormLaunchUrl, getScormOutline, ingestScormPackage } from "../services/scorm-content";
import { requireAuth, requireRole } from "../middleware/auth";
import { upload } from "../types/upload";

export const courseRouter = Router();

const createCourseSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  packagePath: z.string().optional(),
  isPublished: z.boolean().optional(),
  resumeMode: z.enum(["LAST_POSITION", "RESTART"]).optional(),
  allowRetake: z.boolean().optional(),
  reviewAfterCompletion: z.boolean().optional(),
});

const updateCourseSettingsSchema = z
  .object({
    resumeMode: z.enum(["LAST_POSITION", "RESTART"]).optional(),
    allowRetake: z.boolean().optional(),
    reviewAfterCompletion: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one setting is required");

const enrollParamsSchema = z.object({
  courseId: z.string().min(1),
  userId: z.string().min(1),
});

const courseParamsSchema = z.object({
  courseId: z.string().min(1),
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
          resumeMode: input.resumeMode ?? "LAST_POSITION",
          allowRetake: input.allowRetake ?? true,
          reviewAfterCompletion: input.reviewAfterCompletion ?? true,
        },
      });

      res.status(201).json({ item: course });
    } catch (error) {
      next(error);
    }
  },
);

courseRouter.patch(
  "/courses/:courseId/settings",
  requireRole(UserRole.TENANT_ADMIN, UserRole.INSTRUCTOR),
  async (req, res, next) => {
    try {
      const { courseId } = courseParamsSchema.parse(req.params);
      const input = updateCourseSettingsSchema.parse(req.body);

      const course = await prisma.course.findFirst({
        where: { id: courseId, tenantId: req.user!.tenantId },
        select: { id: true },
      });

      if (!course) {
        res.status(404).json({ message: "Course not found for this tenant" });
        return;
      }

      const updated = await prisma.course.update({
        where: { id: course.id },
        data: {
          ...(input.resumeMode !== undefined ? { resumeMode: input.resumeMode } : {}),
          ...(input.allowRetake !== undefined ? { allowRetake: input.allowRetake } : {}),
          ...(input.reviewAfterCompletion !== undefined
            ? { reviewAfterCompletion: input.reviewAfterCompletion }
            : {}),
        },
      });

      res.json({ item: updated });
    } catch (error) {
      next(error);
    }
  },
);

courseRouter.post(
  "/courses/:courseId/scorm-package",
  requireRole(UserRole.TENANT_ADMIN, UserRole.INSTRUCTOR),
  upload.single("package"),
  async (req, res, next) => {
    const uploadFilePath = req.file?.path;

    try {
      const { courseId } = courseParamsSchema.parse(req.params);

      const course = await prisma.course.findFirst({
        where: { id: courseId, tenantId: req.user!.tenantId },
      });

      if (!course) {
        res.status(404).json({ message: "Course not found for this tenant" });
        return;
      }

      if (!req.file) {
        res.status(400).json({ message: "SCORM package file is required" });
        return;
      }

      if (!req.file.originalname.toLowerCase().endsWith(".zip")) {
        res.status(400).json({ message: "Only .zip SCORM packages are supported" });
        return;
      }

      const scorm = await ingestScormPackage({
        tenantId: req.user!.tenantId,
        courseId,
        zipFilePath: req.file.path,
      });

      const updatedCourse = await prisma.course.update({
        where: { id: course.id },
        data: {
          packagePath: scorm.packagePath,
          scormVersion: scorm.detectedVersion,
        },
      });

      res.status(201).json({ item: updatedCourse, detectedScormVersion: scorm.detectedVersion });
    } catch (error) {
      next(error);
    } finally {
      if (uploadFilePath) {
        await fs.rm(uploadFilePath, { force: true });
      }
    }
  },
);

courseRouter.get("/courses/:courseId/scorm-launch", async (req, res, next) => {
  try {
    const { courseId } = courseParamsSchema.parse(req.params);

    const course = await prisma.course.findFirst({
      where: { id: courseId, tenantId: req.user!.tenantId },
      select: {
        id: true,
        packagePath: true,
      },
    });

    if (!course) {
      res.status(404).json({ message: "Course not found for this tenant" });
      return;
    }

    if (!course.packagePath) {
      res.status(400).json({ message: "Course has no SCORM package yet" });
      return;
    }

    const host = `${req.protocol}://${req.get("host")}`;
    const launchUrl = buildScormLaunchUrl({
      host,
      packagePath: course.packagePath,
    });

    res.json({ launchUrl });
  } catch (error) {
    next(error);
  }
});

courseRouter.get("/courses/:courseId/scorm-outline", async (req, res, next) => {
  try {
    const { courseId } = courseParamsSchema.parse(req.params);

    const course = await prisma.course.findFirst({
      where: { id: courseId, tenantId: req.user!.tenantId },
      select: {
        id: true,
        packagePath: true,
      },
    });

    if (!course) {
      res.status(404).json({ message: "Course not found for this tenant" });
      return;
    }

    if (!course.packagePath) {
      res.status(400).json({ message: "Course has no SCORM package yet" });
      return;
    }

    const host = `${req.protocol}://${req.get("host")}`;
    const outline = await getScormOutline({
      tenantId: req.user!.tenantId,
      courseId,
    });

    const mapItem = (item: {
      identifier: string | null;
      title: string;
      launchPath: string | null;
      isVisible: boolean;
      children: any[];
    }): any => ({
      identifier: item.identifier,
      title: item.title,
      isVisible: item.isVisible,
      launchUrl: item.launchPath ? buildScormLaunchUrl({ host, packagePath: item.launchPath }) : null,
      children: item.children.map(mapItem),
    });

    res.json({
      sequencingDetected: outline.sequencingDetected,
      items: outline.items.map(mapItem),
    });
  } catch (error) {
    next(error);
  }
});

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
