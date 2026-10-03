BEGIN;
-- Fail closed: do not silently round historical financial values. Back up/reconcile before running.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "Wallet" WHERE "credit" < 0 OR "credit" >= 'Infinity'::float8 OR abs("credit"::numeric - round("credit"::numeric, 2)) > 0.0000001 OR "credit" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile Wallet.credit before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "Wallet" WHERE "coins" < 0 OR "coins" >= 'Infinity'::float8 OR abs("coins"::numeric - round("coins"::numeric, 2)) > 0.0000001 OR "coins" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile Wallet.coins before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "Wallet" WHERE "bonus" < 0 OR "bonus" >= 'Infinity'::float8 OR abs("bonus"::numeric - round("bonus"::numeric, 2)) > 0.0000001 OR "bonus" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile Wallet.bonus before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "Transaction" WHERE "amount" < 0 OR "amount" >= 'Infinity'::float8 OR abs("amount"::numeric - round("amount"::numeric, 2)) > 0.0000001 OR "amount" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile Transaction.amount before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "CoinPackage" WHERE "amount" < 0 OR "amount" >= 'Infinity'::float8 OR abs("amount"::numeric - round("amount"::numeric, 2)) > 0.0000001 OR "amount" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile CoinPackage.amount before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "CoinPackage" WHERE "price" < 0 OR "price" >= 'Infinity'::float8 OR abs("price"::numeric - round("price"::numeric, 2)) > 0.0000001 OR "price" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile CoinPackage.price before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "CoinPackage" WHERE "bonus" < 0 OR "bonus" >= 'Infinity'::float8 OR abs("bonus"::numeric - round("bonus"::numeric, 2)) > 0.0000001 OR "bonus" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile CoinPackage.bonus before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "CoinPackage" WHERE "ngnPrice" < 0 OR "ngnPrice" >= 'Infinity'::float8 OR abs("ngnPrice"::numeric - round("ngnPrice"::numeric, 2)) > 0.0000001 OR "ngnPrice" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile CoinPackage.ngnPrice before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "CoinPackage" WHERE "ngnBonus" < 0 OR "ngnBonus" >= 'Infinity'::float8 OR abs("ngnBonus"::numeric - round("ngnBonus"::numeric, 2)) > 0.0000001 OR "ngnBonus" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile CoinPackage.ngnBonus before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "TipPackage" WHERE "price" < 0 OR "price" >= 'Infinity'::float8 OR abs("price"::numeric - round("price"::numeric, 2)) > 0.0000001 OR "price" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile TipPackage.price before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "RewardTip" WHERE "amount" < 0 OR "amount" >= 'Infinity'::float8 OR abs("amount"::numeric - round("amount"::numeric, 2)) > 0.0000001 OR "amount" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile RewardTip.amount before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "SubscriptionPlan" WHERE "price" < 0 OR "price" >= 'Infinity'::float8 OR abs("price"::numeric - round("price"::numeric, 2)) > 0.0000001 OR "price" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile SubscriptionPlan.price before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "SubscriptionPlan" WHERE "ngnPrice" < 0 OR "ngnPrice" >= 'Infinity'::float8 OR abs("ngnPrice"::numeric - round("ngnPrice"::numeric, 2)) > 0.0000001 OR "ngnPrice" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile SubscriptionPlan.ngnPrice before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "GameAchievement" WHERE "amount" < 0 OR "amount" >= 'Infinity'::float8 OR abs("amount"::numeric - round("amount"::numeric, 2)) > 0.0000001 OR "amount" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile GameAchievement.amount before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "Task" WHERE "reward" < 0 OR "reward" >= 'Infinity'::float8 OR abs("reward"::numeric - round("reward"::numeric, 2)) > 0.0000001 OR "reward" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile Task.reward before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "Referral" WHERE "amount" < 0 OR "amount" >= 'Infinity'::float8 OR abs("amount"::numeric - round("amount"::numeric, 2)) > 0.0000001 OR "amount" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile Referral.amount before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "Quiz" WHERE "rewardAmount" < 0 OR "rewardAmount" >= 'Infinity'::float8 OR abs("rewardAmount"::numeric - round("rewardAmount"::numeric, 2)) > 0.0000001 OR "rewardAmount" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile Quiz.rewardAmount before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "QuizReward" WHERE "amount" < 0 OR "amount" >= 'Infinity'::float8 OR abs("amount"::numeric - round("amount"::numeric, 2)) > 0.0000001 OR "amount" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile QuizReward.amount before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "Revenue" WHERE "amount" < 0 OR "amount" >= 'Infinity'::float8 OR abs("amount"::numeric - round("amount"::numeric, 2)) > 0.0000001 OR "amount" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile Revenue.amount before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "GameMonthRewardStat" WHERE "coinsSpent" < 0 OR "coinsSpent" >= 'Infinity'::float8 OR abs("coinsSpent"::numeric - round("coinsSpent"::numeric, 2)) > 0.0000001 OR "coinsSpent" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile GameMonthRewardStat.coinsSpent before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "GameMonthRewardStat" WHERE "bonusSpent" < 0 OR "bonusSpent" >= 'Infinity'::float8 OR abs("bonusSpent"::numeric - round("bonusSpent"::numeric, 2)) > 0.0000001 OR "bonusSpent" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile GameMonthRewardStat.bonusSpent before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "GameMonthRewardStat" WHERE "creditShareAmount" < 0 OR "creditShareAmount" >= 'Infinity'::float8 OR abs("creditShareAmount"::numeric - round("creditShareAmount"::numeric, 2)) > 0.0000001 OR "creditShareAmount" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile GameMonthRewardStat.creditShareAmount before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "GameMonthRewardStat" WHERE "coinsShareAmount" < 0 OR "coinsShareAmount" >= 'Infinity'::float8 OR abs("coinsShareAmount"::numeric - round("coinsShareAmount"::numeric, 2)) > 0.0000001 OR "coinsShareAmount" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile GameMonthRewardStat.coinsShareAmount before decimal migration';
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "GameMonthRewardStat" WHERE "bonusShareAmount" < 0 OR "bonusShareAmount" >= 'Infinity'::float8 OR abs("bonusShareAmount"::numeric - round("bonusShareAmount"::numeric, 2)) > 0.0000001 OR "bonusShareAmount" > 10000000000) THEN
   RAISE EXCEPTION 'Reconcile GameMonthRewardStat.bonusShareAmount before decimal migration';
 END IF;
END $$;
ALTER TABLE "Wallet" DROP CONSTRAINT "Wallet_nonnegative_finite";
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_nonnegative_finite";
ALTER TABLE "Wallet" ALTER COLUMN "credit" TYPE numeric(20,2) USING round("credit"::numeric, 2);
ALTER TABLE "Wallet" ALTER COLUMN "coins" TYPE numeric(20,2) USING round("coins"::numeric, 2);
ALTER TABLE "Wallet" ALTER COLUMN "bonus" TYPE numeric(20,2) USING round("bonus"::numeric, 2);
ALTER TABLE "Transaction" ALTER COLUMN "amount" TYPE numeric(20,2) USING round("amount"::numeric, 2);
ALTER TABLE "CoinPackage" ALTER COLUMN "amount" TYPE numeric(20,2) USING round("amount"::numeric, 2);
ALTER TABLE "CoinPackage" ALTER COLUMN "price" TYPE numeric(20,2) USING round("price"::numeric, 2);
ALTER TABLE "CoinPackage" ALTER COLUMN "bonus" TYPE numeric(20,2) USING round("bonus"::numeric, 2);
ALTER TABLE "CoinPackage" ALTER COLUMN "ngnPrice" TYPE numeric(20,2) USING round("ngnPrice"::numeric, 2);
ALTER TABLE "CoinPackage" ALTER COLUMN "ngnBonus" TYPE numeric(20,2) USING round("ngnBonus"::numeric, 2);
ALTER TABLE "TipPackage" ALTER COLUMN "price" TYPE numeric(20,2) USING round("price"::numeric, 2);
ALTER TABLE "RewardTip" ALTER COLUMN "amount" TYPE numeric(20,2) USING round("amount"::numeric, 2);
ALTER TABLE "SubscriptionPlan" ALTER COLUMN "price" TYPE numeric(20,2) USING round("price"::numeric, 2);
ALTER TABLE "SubscriptionPlan" ALTER COLUMN "ngnPrice" TYPE numeric(20,2) USING round("ngnPrice"::numeric, 2);
ALTER TABLE "GameAchievement" ALTER COLUMN "amount" TYPE numeric(20,2) USING round("amount"::numeric, 2);
ALTER TABLE "Task" ALTER COLUMN "reward" TYPE numeric(20,2) USING round("reward"::numeric, 2);
ALTER TABLE "Referral" ALTER COLUMN "amount" TYPE numeric(20,2) USING round("amount"::numeric, 2);
ALTER TABLE "Quiz" ALTER COLUMN "rewardAmount" TYPE numeric(20,2) USING round("rewardAmount"::numeric, 2);
ALTER TABLE "QuizReward" ALTER COLUMN "amount" TYPE numeric(20,2) USING round("amount"::numeric, 2);
ALTER TABLE "Revenue" ALTER COLUMN "amount" TYPE numeric(20,2) USING round("amount"::numeric, 2);
ALTER TABLE "GameMonthRewardStat" ALTER COLUMN "coinsSpent" TYPE numeric(20,2) USING round("coinsSpent"::numeric, 2);
ALTER TABLE "GameMonthRewardStat" ALTER COLUMN "bonusSpent" TYPE numeric(20,2) USING round("bonusSpent"::numeric, 2);
ALTER TABLE "GameMonthRewardStat" ALTER COLUMN "creditShareAmount" TYPE numeric(20,2) USING round("creditShareAmount"::numeric, 2);
ALTER TABLE "GameMonthRewardStat" ALTER COLUMN "coinsShareAmount" TYPE numeric(20,2) USING round("coinsShareAmount"::numeric, 2);
ALTER TABLE "GameMonthRewardStat" ALTER COLUMN "bonusShareAmount" TYPE numeric(20,2) USING round("bonusShareAmount"::numeric, 2);
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_nonnegative_finite" CHECK (credit >= 0 AND credit <= 10000000000 AND coins >= 0 AND coins <= 10000000000 AND bonus >= 0 AND bonus <= 10000000000);
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_nonnegative_finite" CHECK (amount >= 0 AND amount <= 10000000000);
COMMIT;
