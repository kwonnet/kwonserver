ALTER TABLE "User" ADD COLUMN "withdrawalRestricted" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "withdrawalRestrictionReason" TEXT;
ALTER TABLE "ChargeRate" ADD COLUMN "withdrawalsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "maxWithdrawal" DECIMAL(20,2) NOT NULL DEFAULT 5000, ADD COLUMN "maxNgnWithdrawal" DECIMAL(20,2) NOT NULL DEFAULT 5000000,
ADD COLUMN "reviewWithdrawal" DECIMAL(20,2) NOT NULL DEFAULT 2500, ADD COLUMN "reviewNgnWithdrawal" DECIMAL(20,2) NOT NULL DEFAULT 2500000;
ALTER TABLE "ChargeRate" ADD CONSTRAINT "ChargeRate_withdrawal_limits_check" CHECK (
"maxWithdrawal" >= "minWithdrawal" AND "maxNgnWithdrawal" >= "minNgnWithdrawal" AND
"reviewWithdrawal" >= "minWithdrawal" AND "reviewWithdrawal" <= "maxWithdrawal" AND
"reviewNgnWithdrawal" >= "minNgnWithdrawal" AND "reviewNgnWithdrawal" <= "maxNgnWithdrawal");
ALTER TABLE "AuthEmailToken" ADD COLUMN "subjectId" TEXT, ADD COLUMN "recipientHash" TEXT, ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EmailMessage" ADD COLUMN "withdrawalId" TEXT;
ALTER TABLE "CoinWithdrawal" ADD COLUMN "otpChallengeId" TEXT, ADD COLUMN "otpVerifiedAt" TIMESTAMP(3),
ADD COLUMN "approvalRequired" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "approvedAt" TIMESTAMP(3), ADD COLUMN "reviewedBy" TEXT, ADD COLUMN "reviewNote" TEXT;
CREATE TABLE "WithdrawalAdminEvent" ("id" TEXT PRIMARY KEY, "actorId" TEXT NOT NULL, "action" TEXT NOT NULL,
"userId" TEXT, "withdrawalId" TEXT, "details" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "WithdrawalAdminEvent_withdrawalId_createdAt_idx" ON "WithdrawalAdminEvent"("withdrawalId", "createdAt");
CREATE INDEX "WithdrawalAdminEvent_userId_createdAt_idx" ON "WithdrawalAdminEvent"("userId", "createdAt");
