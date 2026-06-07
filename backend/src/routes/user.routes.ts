import { UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

export const userRouter = Router();

const roleSchema = z
  .nativeEnum(UserRole)
  .refine((role) => role !== UserRole.SUPER_ADMIN, "Role SUPER_ADMIN is not allowed");

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
  password: z.string().min(8),
  role: roleSchema,
  isActive: z.boolean().optional(),
});

const updateUserSchema = z
  .object({
    name: z.string().min(2).optional(),
    role: roleSchema.optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(8).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const userParamsSchema = z.object({
  userId: z.string().min(1),
});

userRouter.use(requireAuth);
userRouter.use(requireRole(UserRole.TENANT_ADMIN));

userRouter.get("/users", async (req, res, next) => {
  try {
    const items = await prisma.user.findMany({
      where: { tenantId: req.user!.tenantId },
      select: {
        id: true,
        tenantId: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

userRouter.post("/users", async (req, res, next) => {
  try {
    const input = createUserSchema.parse(req.body);

    const exists = await prisma.user.findUnique({
      where: {
        tenantId_email: {
          tenantId: req.user!.tenantId,
          email: input.email,
        },
      },
      select: { id: true },
    });

    if (exists) {
      res.status(409).json({ message: "Email already in use for this tenant" });
      return;
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const user = await prisma.user.create({
      data: {
        tenantId: req.user!.tenantId,
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
        isActive: input.isActive ?? true,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(201).json({ item: user });
  } catch (error) {
    next(error);
  }
});

userRouter.patch("/users/:userId", async (req, res, next) => {
  try {
    const { userId } = userParamsSchema.parse(req.params);
    const input = updateUserSchema.parse(req.body);

    const current = await prisma.user.findFirst({
      where: { id: userId, tenantId: req.user!.tenantId },
    });

    if (!current) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const isTargetTenantAdmin = current.role === UserRole.TENANT_ADMIN;
    const roleWillStopBeingTenantAdmin =
      input.role !== undefined && input.role !== UserRole.TENANT_ADMIN;
    const willDeactivateTenantAdmin = input.isActive === false;

    if (isTargetTenantAdmin && (roleWillStopBeingTenantAdmin || willDeactivateTenantAdmin)) {
      const activeTenantAdminCount = await prisma.user.count({
        where: {
          tenantId: req.user!.tenantId,
          role: UserRole.TENANT_ADMIN,
          isActive: true,
        },
      });

      if (activeTenantAdminCount <= 1) {
        res.status(400).json({
          message: "Tenant must keep at least one active TENANT_ADMIN",
        });
        return;
      }
    }

    let passwordHash: string | undefined;
    if (input.password) {
      passwordHash = await bcrypt.hash(input.password, 10);
    }

    const user = await prisma.user.update({
      where: { id: current.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(passwordHash !== undefined ? { passwordHash } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({ item: user });
  } catch (error) {
    next(error);
  }
});

userRouter.delete("/users/:userId", async (req, res, next) => {
  try {
    const { userId } = userParamsSchema.parse(req.params);

    const current = await prisma.user.findFirst({
      where: { id: userId, tenantId: req.user!.tenantId },
    });

    if (!current) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    if (current.id === req.user!.id) {
      res.status(400).json({ message: "You cannot delete your own account" });
      return;
    }

    if (current.role === UserRole.TENANT_ADMIN && current.isActive) {
      const activeTenantAdminCount = await prisma.user.count({
        where: {
          tenantId: req.user!.tenantId,
          role: UserRole.TENANT_ADMIN,
          isActive: true,
        },
      });

      if (activeTenantAdminCount <= 1) {
        res.status(400).json({
          message: "Tenant must keep at least one active TENANT_ADMIN",
        });
        return;
      }
    }

    await prisma.user.delete({ where: { id: current.id } });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
