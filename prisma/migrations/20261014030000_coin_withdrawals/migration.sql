CREATE TABLE "CoinWithdrawal" (
"id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
"gateway" "TxnGatewayEnum" NOT NULL, "environment" TEXT NOT NULL, "country" TEXT NOT NULL,
"coins" DECIMAL(20,2) NOT NULL, "rate" DECIMAL(20,6) NOT NULL, "fee" DECIMAL(20,6) NOT NULL,
"minimum" DECIMAL(20,2) NOT NULL, "amount" DECIMAL(20,2) NOT NULL, "currency" TEXT NOT NULL,
"destination" JSONB NOT NULL, "providerData" JSONB NOT NULL, "receiveAmount" TEXT NOT NULL,
"receiveCurrency" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
"status" TEXT NOT NULL DEFAULT 'QUOTED', "stage" TEXT NOT NULL DEFAULT 'PREPARED', "providerId" TEXT,
"processingUntil" TIMESTAMP(3), "processingAttempts" INTEGER NOT NULL DEFAULT 0,
"reviewRequiredAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
CONSTRAINT "CoinWithdrawal_money_check" CHECK ("coins" > 0 AND "amount" > 0 AND "rate" > 0 AND "fee" >= 0 AND "fee" < 1 AND "minimum" >= 0)
);
CREATE INDEX "CoinWithdrawal_userId_createdAt_idx" ON "CoinWithdrawal"("userId","createdAt");
CREATE INDEX "CoinWithdrawal_status_updatedAt_idx" ON "CoinWithdrawal"("status","updatedAt");
CREATE UNIQUE INDEX "CoinWithdrawal_gateway_environment_providerId_key" ON "CoinWithdrawal"("gateway","environment","providerId");
CREATE TABLE "WithdrawalRecipient" (
"id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
"environment" TEXT NOT NULL, "providerId" TEXT, "profile" JSONB NOT NULL,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE UNIQUE INDEX "WithdrawalRecipient_userId_environment_key" ON "WithdrawalRecipient"("userId","environment");
