import { env } from "./lib/env";
import { app } from "./app";
import { prisma } from "./lib/prisma";

const server = app.listen(env.port, () => {
  console.log(`Backend running at http://localhost:${env.port}`);
});

const shutdown = async () => {
  await prisma.$disconnect();
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
