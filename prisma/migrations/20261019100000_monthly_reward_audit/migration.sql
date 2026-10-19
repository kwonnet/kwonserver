ALTER TABLE "GameMonthRewardStat"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'LEGACY_COMPLETED',
  ADD COLUMN "policyVersion" TEXT,
  ADD COLUMN "qualifyingPercentage" INTEGER,
  ADD COLUMN "rewardPercentage" INTEGER,
  ADD COLUMN "fullyAllocated" BOOLEAN,
  ADD COLUMN "processedParticipants" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "snapshotKey" TEXT,
  ADD COLUMN "payoutPlan" JSONB,
  ADD COLUMN "legacyBreakdown" JSONB,
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "lastError" TEXT;
ALTER TABLE "GameMonthRewardStat" ADD COLUMN "grossSpent" DECIMAL(20,2);
ALTER TABLE "GameMonthRewardStat" ADD COLUMN "bonusOffsetApplied" DECIMAL(20,2);
ALTER TABLE "GameMonthRewardStat" ADD COLUMN "bonusOffsetShortfall" DECIMAL(20,2);
ALTER TABLE "GameMonthRewardStat" ADD COLUMN "fundingBalance" DECIMAL(20,2);
ALTER TABLE "GameMonthRewardStat" ADD COLUMN "rewardPoolAmount" DECIMAL(20,2);
ALTER TABLE "GameMonthRewardStat" ADD COLUMN "distributableAmount" DECIMAL(20,2);
ALTER TABLE "GameMonthRewardStat" ADD COLUMN "retainedBalance" DECIMAL(20,2);
ALTER TABLE "GameMonthRewardStat" ADD COLUMN "capUnallocatedAmount" DECIMAL(20,2);
ALTER TABLE "GameMonthRewardStat" ADD COLUMN "unallocatedAmount" DECIMAL(20,2);
ALTER TABLE "GameMonthRewardStat" ADD COLUMN "pendingAmount" DECIMAL(20,2);
ALTER TABLE "GameMonthRewardStat" ADD COLUMN "balanceAfterPayout" DECIMAL(20,2);
ALTER TABLE "GameMonthRewardStat" ADD COLUMN "minimumReward" DECIMAL(20,2);
ALTER TABLE "GameMonthRewardStat" ADD COLUMN "maximumReward" DECIMAL(20,2);
ALTER TABLE "GameMonthRewardStat" ADD COLUMN "rewardCap" DECIMAL(20,2);

-- Preserve historical group details; their funding policy cannot be inferred.
UPDATE "GameMonthRewardStat" SET "legacyBreakdown" = jsonb_build_object(
  'topCoinsShareAmount', "topCoinsShareAmount"::text,
  'bonusShareAmount', "bonusShareAmount"::text,
  'coinsShareAmount', "coinsShareAmount"::text,
  'topCoinsRewardParticipants', "topCoinsRewardParticipants",
  'bonusRewardParticipants', "bonusRewardParticipants",
  'coinsRewardParticipants', "coinsRewardParticipants",
  'topCoinsParticipantsScore', "topCoinsParticipantsScore",
  'bonusParticipantsScore', "bonusParticipantsScore",
  'coinsParticipantsScore', "coinsParticipantsScore"
), "coinsShareAmount" = "coinsShareAmount" + "topCoinsShareAmount",
   "coinsRewardParticipants" = "coinsRewardParticipants" + "topCoinsRewardParticipants",
   "coinsParticipantsScore" = "coinsParticipantsScore" + "topCoinsParticipantsScore";

ALTER TABLE "GameMonthRewardStat"
  DROP COLUMN "topCoinsShareAmount",
  DROP COLUMN "bonusShareAmount",
  DROP COLUMN "topCoinsRewardParticipants",
  DROP COLUMN "bonusRewardParticipants",
  DROP COLUMN "topCoinsParticipantsScore",
  DROP COLUMN "bonusParticipantsScore";

CREATE INDEX "GameMonthRewardStat_catId_mode_year_month_idx"
  ON "GameMonthRewardStat"("catId", "mode", "year", "month");
CREATE INDEX "GameMonthRewardStat_year_month_status_idx"
  ON "GameMonthRewardStat"("year", "month", "status");
-- Legacy duplicates stay intact; enforce one record per new-policy period only.
CREATE UNIQUE INDEX "GameMonthRewardStat_new_policy_period_key"
  ON "GameMonthRewardStat"("catId", "mode", "year", "month")
  WHERE "policyVersion" IS NOT NULL;

-- Preserve historical unknowns; enforce reconciliation identities whenever the
-- corresponding new-policy amounts are present.
ALTER TABLE "GameMonthRewardStat" ADD CONSTRAINT "GameMonthRewardStat_allocation_reconciles"
CHECK ("policyVersion" IS NULL OR (
  "coinsShareAmount" >= 0 AND "pendingAmount" >= 0 AND "unallocatedAmount" >= 0
  AND "capUnallocatedAmount" >= 0 AND "retainedBalance" >= 0
  AND "rewardPoolAmount" = "coinsShareAmount" + "unallocatedAmount"
  AND "distributableAmount" = "coinsShareAmount" + "pendingAmount"
  AND "rewardPoolAmount" = "distributableAmount" + "capUnallocatedAmount"
  AND "fundingBalance" = "retainedBalance" + "rewardPoolAmount"
  AND "balanceAfterPayout" = "retainedBalance" + "unallocatedAmount"
  AND "coinsRewardParticipants" <= "processedParticipants"
  AND "processedParticipants" <= "rewardParticipants"
  AND ("fullyAllocated" IS NOT TRUE OR (
    "status" = 'COMPLETED' AND "pendingAmount" = 0 AND "unallocatedAmount" = 0
  ))
));
