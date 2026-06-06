import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const slug = "acme";
  const adminEmail = "admin@acme.local";

  const passwordHash = await bcrypt.hash("Admin@123", 10);

  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: {},
    create: {
      name: "Acme Corp",
      slug,
    },
  });

  await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: adminEmail,
      },
    },
    update: {
      name: "Tenant Admin",
      role: UserRole.TENANT_ADMIN,
      isActive: true,
      passwordHash,
    },
    create: {
      tenantId: tenant.id,
      name: "Tenant Admin",
      email: adminEmail,
      passwordHash,
      role: UserRole.TENANT_ADMIN,
    },
  });

  console.log("Seed complete");
  console.log("tenantSlug: acme");
  console.log("adminEmail: admin@acme.local");
  console.log("adminPassword: Admin@123");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
