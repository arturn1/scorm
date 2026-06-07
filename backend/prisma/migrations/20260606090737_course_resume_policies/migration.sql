-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Course" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scormVersion" TEXT NOT NULL DEFAULT 'SCORM_2004',
    "packagePath" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "resumeMode" TEXT NOT NULL DEFAULT 'LAST_POSITION',
    "allowRetake" BOOLEAN NOT NULL DEFAULT true,
    "reviewAfterCompletion" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Course_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Course" ("createdAt", "description", "id", "isPublished", "packagePath", "scormVersion", "tenantId", "title", "updatedAt") SELECT "createdAt", "description", "id", "isPublished", "packagePath", "scormVersion", "tenantId", "title", "updatedAt" FROM "Course";
DROP TABLE "Course";
ALTER TABLE "new_Course" RENAME TO "Course";
CREATE INDEX "Course_tenantId_idx" ON "Course"("tenantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
