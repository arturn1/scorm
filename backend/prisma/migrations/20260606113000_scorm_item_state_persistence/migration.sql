-- Per-item SCORM persistence for scalable progress/score reads
CREATE TABLE "ScormAttemptItemState" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "attemptId" TEXT NOT NULL,
  "itemKey" TEXT NOT NULL,
  "launchUrl" TEXT NOT NULL,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "quizScore" REAL,
  "successStatus" TEXT,
  "completionStatus" TEXT,
  "location" TEXT,
  "isQuiz" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ScormAttemptItemState_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ScormAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ScormAttemptItemState_attemptId_itemKey_key" ON "ScormAttemptItemState"("attemptId", "itemKey");
CREATE INDEX "ScormAttemptItemState_attemptId_idx" ON "ScormAttemptItemState"("attemptId");
CREATE INDEX "ScormAttemptItemState_attemptId_updatedAt_idx" ON "ScormAttemptItemState"("attemptId", "updatedAt");
