CREATE TABLE "GameWalletAction" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "roomId" TEXT NOT NULL,
 "roundId" TEXT, "kind" TEXT NOT NULL, "payload" JSONB NOT NULL,
 "deductedCoins" NUMERIC(20,2) NOT NULL, "deductedBonus" NUMERIC(20,2) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "reason" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "settledAt" TIMESTAMP(3),
 CONSTRAINT "GameWalletAction_status" CHECK (status IN ('PENDING','DELIVERED','REFUNDED')),
 CONSTRAINT "GameWalletAction_kind" CHECK (kind IN ('ANSWER','ACRONYM','WORDMAKER','VOTE','CHAT')),
 CONSTRAINT "GameWalletAction_amounts" CHECK ("deductedCoins" >= 0 AND "deductedCoins" <= 10000000000 AND "deductedBonus" >= 0 AND "deductedBonus" <= 10000000000)
);
CREATE INDEX "GameWalletAction_status_createdAt_idx" ON "GameWalletAction"("status", "createdAt");
