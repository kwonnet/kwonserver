ALTER TABLE "ChargeRate" ADD COLUMN "tipFee" DECIMAL(10,6) NOT NULL DEFAULT 0.5, ADD COLUMN "quizFee" DECIMAL(10,6) NOT NULL DEFAULT 0.15;
ALTER TABLE "ChargeRate" ADD CONSTRAINT "ChargeRate_transaction_fees" CHECK ("tipFee">=0 AND "tipFee"<1 AND "quizFee">=0 AND "quizFee"<=1);
ALTER TABLE "Quiz" ADD COLUMN "fundedAmount" DECIMAL(20,2), ADD COLUMN "feeRate" DECIMAL(10,6), ADD COLUMN "feeAmount" DECIMAL(20,2), ADD COLUMN "fundingTxnRef" TEXT, ADD COLUMN "settlementStatus" TEXT NOT NULL DEFAULT 'UNFUNDED', ADD COLUMN "selectionSeed" TEXT, ADD COLUMN "settledAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Quiz_fundingTxnRef_key" ON "Quiz"("fundingTxnRef");
CREATE INDEX "Quiz_settlementStatus_expireAt_idx" ON "Quiz"("settlementStatus","expireAt");
ALTER TABLE "QuizReward" ADD COLUMN status "TxnStatusEnum" NOT NULL DEFAULT 'COMPLETED', ADD COLUMN "paidAt" TIMESTAMP(3);
DROP INDEX "QuizReward_userId_key";
CREATE INDEX "QuizReward_quizId_status_id_idx" ON "QuizReward"("quizId",status,id);
CREATE INDEX "QuizParticipant_quizId_isCorrect_createdAt_idx" ON "QuizParticipant"("quizId","isCorrect","createdAt");
-- Only independently proven, previously debited pools are enabled for recovery.
UPDATE "Quiz" SET "settlementStatus"='REVIEW' WHERE "isPaid"=true;
WITH proven AS (
 SELECT q.id, MIN(t."txnRef") AS reference FROM "Quiz" q JOIN "Post" p ON p.id=q."postId"
 JOIN "Transaction" t ON t."postId"=p.id AND t.user_id=p."userId" AND t.type='DEBIT' AND t.category='QUIZ_POST' AND t.currency='COINS' AND t.status='COMPLETED' AND t.amount=q."rewardAmount"
 WHERE q."isPaid" AND q."rewardAmount">0 AND q."maxWinners">0 AND NOT EXISTS(SELECT 1 FROM "QuizReward" r WHERE r."quizId"=q.id)
 GROUP BY q.id HAVING COUNT(*)=1 AND COUNT(DISTINCT t."txnRef")=1
)
UPDATE "Quiz" q SET "fundedAmount"=q."rewardAmount","fundingTxnRef"=proven.reference,"feeRate"=0,"feeAmount"=0,"settlementStatus"='FUNDED' FROM proven WHERE proven.id=q.id;
