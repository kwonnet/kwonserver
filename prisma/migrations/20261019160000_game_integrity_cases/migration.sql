CREATE TABLE "GameIntegrityCase" (
 id TEXT PRIMARY KEY,"userId" TEXT NOT NULL,"gameId" TEXT NOT NULL,"catId" TEXT NOT NULL,
 "roomId" TEXT NOT NULL,"roundId" TEXT NOT NULL,"questionId" TEXT NOT NULL,mode "GameMode" NOT NULL,
 "gameKind" TEXT NOT NULL,"submittedValue" TEXT NOT NULL,"allowedValues" JSONB NOT NULL,
 "awardedPoints" INTEGER NOT NULL DEFAULT 0,reason TEXT NOT NULL DEFAULT 'INVALID_LUCK_SELECTION',
 "requestDetails" JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',"queuedAt" TIMESTAMP(3),
 "reviewReadyAt" TIMESTAMP(3),"reviewedAt" TIMESTAMP(3),resolution TEXT,
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "GameIntegrityCase_status_nextAttemptAt_idx" ON "GameIntegrityCase"(status,"nextAttemptAt");
CREATE INDEX "GameIntegrityCase_userId_createdAt_idx" ON "GameIntegrityCase"("userId","createdAt");
CREATE INDEX "GameIntegrityCase_catId_roundId_idx" ON "GameIntegrityCase"("catId","roundId");
