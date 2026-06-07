-- CreateTable
CREATE TABLE "ScormAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "completionStatus" TEXT,
    "successStatus" TEXT,
    "scoreRaw" REAL,
    "scoreScaled" REAL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScormAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScormAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScormAttempt_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScormRuntimeValue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScormRuntimeValue_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ScormAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ScormAttempt_tenantId_userId_courseId_idx" ON "ScormAttempt"("tenantId", "userId", "courseId");

-- CreateIndex
CREATE INDEX "ScormAttempt_tenantId_courseId_idx" ON "ScormAttempt"("tenantId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "ScormAttempt_tenantId_userId_courseId_attemptNumber_key" ON "ScormAttempt"("tenantId", "userId", "courseId", "attemptNumber");

-- CreateIndex
CREATE INDEX "ScormRuntimeValue_attemptId_idx" ON "ScormRuntimeValue"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "ScormRuntimeValue_attemptId_key_key" ON "ScormRuntimeValue"("attemptId", "key");
