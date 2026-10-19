CREATE TABLE "GameMilestoneRewardTask" (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('WEEK','YEAR','CHAMP','GRAND_CHAMP')),
  "scopeId" TEXT NOT NULL, mode "GameMode", year INTEGER NOT NULL,
  week INTEGER NOT NULL DEFAULT 0 CHECK (week BETWEEN 0 AND 53), "rankingKey" TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','FAILED','COMPLETED')),
  plan JSONB, processed INTEGER NOT NULL DEFAULT 0, "previouslyPaid" INTEGER NOT NULL DEFAULT 0,
  "coinsPaid" DECIMAL(20,2) NOT NULL DEFAULT 0, "bonusPaid" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "notificationIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "cachePending" BOOLEAN NOT NULL DEFAULT false,
  failures INTEGER NOT NULL DEFAULT 0, "lastError" TEXT,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK ((kind='GRAND_CHAMP' AND mode IS NULL AND "scopeId"='global') OR (kind<>'GRAND_CHAMP' AND mode IS NOT NULL)),
  CHECK ((kind='WEEK' AND week>0 AND "rankingKey" IS NOT NULL) OR (kind<>'WEEK' AND week=0)),
  CHECK (processed>=0 AND "previouslyPaid">=0 AND "coinsPaid">=0 AND "bonusPaid">=0)
);
CREATE UNIQUE INDEX "GameMilestoneRewardTask_kind_scopeId_mode_year_week_key" ON "GameMilestoneRewardTask"(kind,"scopeId",mode,year,week);
CREATE INDEX "GameMilestoneRewardTask_status_nextAttemptAt_idx" ON "GameMilestoneRewardTask"(status,"nextAttemptAt");
CREATE INDEX "GameMilestoneRewardTask_cachePending_nextAttemptAt_idx" ON "GameMilestoneRewardTask"("cachePending","nextAttemptAt");
CREATE INDEX "GameMilestoneRewardTask_kind_year_week_idx" ON "GameMilestoneRewardTask"(kind,year,week);
