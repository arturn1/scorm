import { UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Router } from "express";
import { z } from "zod";
import { env } from "../lib/env";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

const registerTenantSchema = z.object({
  tenantName: z.string().min(2),
  tenantSlug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  adminName: z.string().min(2),
  adminEmail: z.email(),
  adminPassword: z.string().min(8),
});

const loginSchema = z.object({
  tenantSlug: z.string().min(2),
  email: z.email(),
  password: z.string().min(8),
});

function issueToken(params: {
  userId: string;
  tenantId: string;
  role: UserRole;
  email: string;
}): string {
  return jwt.sign(
    {
      tenantId: params.tenantId,
      role: params.role,
      email: params.email,
    },
    env.jwtSecret,
    {
      subject: params.userId,
      expiresIn: "8h",
    },
  );
}

authRouter.post("/auth/register-tenant", async (req, res, next) => {
  try {
    const input = registerTenantSchema.parse(req.body);

    const existingTenant = await prisma.tenant.findUnique({
      where: { slug: input.tenantSlug },
    });

    if (existingTenant) {
      res.status(409).json({ message: "Tenant slug already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(input.adminPassword, 10);

    const tenant = await prisma.tenant.create({
      data: {
        name: input.tenantName,
        slug: input.tenantSlug,
        users: {
          create: {
            name: input.adminName,
            email: input.adminEmail,
            passwordHash,
            role: UserRole.TENANT_ADMIN,
          },
        },
      },
      include: { users: true },
    });

    const admin = tenant.users[0];
    if (!admin) {
      res.status(500).json({ message: "Failed to create tenant admin" });
      return;
    }

    const token = issueToken({
      userId: admin.id,
      tenantId: tenant.id,
      role: admin.role,
      email: admin.email,
    });

    res.status(201).json({
      token,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      user: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/auth/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);

    const tenant = await prisma.tenant.findUnique({
      where: { slug: input.tenantSlug },
    });

    if (!tenant) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: {
        tenantId_email: {
          tenantId: tenant.id,
          email: input.email,
        },
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const passwordMatch = await bcrypt.compare(input.password, user.passwordHash);

    if (!passwordMatch) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const token = issueToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    });

    res.json({
      token,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/auth/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        tenantId: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
});
