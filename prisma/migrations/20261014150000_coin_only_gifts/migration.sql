BEGIN;
-- Discard legacy wallet balances and pending rewards, as explicitly requested.
UPDATE "RewardTip" r SET status='EXPIRED', "updatedAt"=NOW()
FROM "Transaction" t WHERE r."txnId"=t.id AND r.status='PENDING' AND t.currency='TZX';
UPDATE "Transaction" SET status='FAILED', description='Legacy wallet reward retired', "updatedAt"=NOW()
WHERE currency='TZX' AND status='PENDING';
UPDATE "Subscription" s SET "isRecurring"=false, "updatedAt"=NOW()
WHERE EXISTS (SELECT 1 FROM "Transaction" t WHERE t."subscriptionId"=s.id AND t.currency='TZX' AND t.gateway='WALLET');
ALTER TABLE "Wallet" DROP CONSTRAINT "Wallet_nonnegative_finite";
ALTER TABLE "Wallet" DROP COLUMN credit;
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_nonnegative_finite" CHECK (coins>=0 AND coins<=10000000000 AND bonus>=0 AND bonus<=10000000000);
-- Preserve immutable historical ledger amounts without an active legacy currency.
ALTER TYPE "TxnCurrencyEnum" RENAME VALUE 'TZX' TO 'RETIRED';
ALTER TYPE "TxnSourceEnum" RENAME VALUE 'CREDIT' TO 'RETIRED';
UPDATE "GameMilestone" SET "rewardType"='COINS' WHERE "rewardType"='CREDIT';
UPDATE "Task" SET "rewardType"='COINS' WHERE "rewardType"='CREDIT';
UPDATE "GameAchievement" SET "rewardType"='COINS',amount=0 WHERE "rewardType"='CREDIT';
ALTER TYPE "RewardTypeEnum" RENAME TO "RewardTypeEnum_old";
CREATE TYPE "RewardTypeEnum" AS ENUM ('COINS','BONUS');
ALTER TABLE "GameMilestone" ALTER COLUMN "rewardType" TYPE "RewardTypeEnum" USING "rewardType"::text::"RewardTypeEnum";
ALTER TABLE "Task" ALTER COLUMN "rewardType" TYPE "RewardTypeEnum" USING "rewardType"::text::"RewardTypeEnum";
ALTER TABLE "GameAchievement" ALTER COLUMN "rewardType" TYPE "RewardTypeEnum" USING "rewardType"::text::"RewardTypeEnum";
DROP TYPE "RewardTypeEnum_old";
ALTER TABLE "GameMonthRewardStat" RENAME COLUMN "creditRewardParticipants" TO "topCoinsRewardParticipants";
ALTER TABLE "GameMonthRewardStat" RENAME COLUMN "creditParticipantsScore" TO "topCoinsParticipantsScore";
ALTER TABLE "GameMonthRewardStat" RENAME COLUMN "creditShareAmount" TO "topCoinsShareAmount";
ALTER TABLE "PostTip" ADD COLUMN "giftName" TEXT, ADD COLUMN "giftThumbnail" TEXT, ADD COLUMN "giftCoinsSnapshot" DECIMAL(20,2);
UPDATE "PostTip" t SET "giftName"=p.name,"giftThumbnail"=p.thumbnail,"giftCoinsSnapshot"=p.price FROM "TipPackage" p WHERE t."tipId"=p.id;
ALTER TABLE "PostTip" DROP CONSTRAINT "PostTip_tipId_fkey";
ALTER TABLE "PostTip" ALTER COLUMN "tipId" DROP NOT NULL;
ALTER TABLE "PostTip" ADD CONSTRAINT "PostTip_tipId_fkey" FOREIGN KEY ("tipId") REFERENCES "TipPackage"(id) ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;
ALTER TYPE "TipSource" ADD VALUE 'PROFILE';
