CREATE TABLE "MonthlyRewardSettlement" (
  id TEXT PRIMARY KEY, "catId" TEXT NOT NULL, mode "GameMode" NOT NULL,
  year INTEGER NOT NULL, month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','FAILED','COMPLETED')),
  failures INTEGER NOT NULL DEFAULT 0, "lastError" TEXT,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("catId") REFERENCES "GameCategory"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MonthlyRewardSettlement_catId_mode_year_month_key" ON "MonthlyRewardSettlement"("catId",mode,year,month);
CREATE INDEX "MonthlyRewardSettlement_status_nextAttemptAt_idx" ON "MonthlyRewardSettlement"(status,"nextAttemptAt");
CREATE INDEX "MonthlyRewardSettlement_year_month_idx" ON "MonthlyRewardSettlement"(year,month);
CREATE TABLE "MonthlyRewardDelivery" (
  id TEXT PRIMARY KEY, "settlementId" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED')),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("settlementId") REFERENCES "MonthlyRewardSettlement"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MonthlyRewardDelivery_status_nextAttemptAt_idx" ON "MonthlyRewardDelivery"(status,"nextAttemptAt");
CREATE INDEX "MonthlyRewardDelivery_settlementId_idx" ON "MonthlyRewardDelivery"("settlementId");
