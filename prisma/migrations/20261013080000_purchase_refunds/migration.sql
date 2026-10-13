ALTER TYPE "TxnCategoryEnum" ADD VALUE 'COIN_REFUND';
-- CreateTable
CREATE TABLE "ChargeRate" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "price" DECIMAL(20,6) NOT NULL DEFAULT 0.015,
    "maxPrice" DECIMAL(20,6) NOT NULL DEFAULT 0.017,
    "minWithdrawal" DECIMAL(20,2) NOT NULL DEFAULT 5,
    "fee" DECIMAL(10,6) NOT NULL DEFAULT 0.25,
    "ngnPrice" DECIMAL(20,6) NOT NULL DEFAULT 18,
    "maxNgnPrice" DECIMAL(20,6) NOT NULL DEFAULT 20,
    "minNgnWithdrawal" DECIMAL(20,2) NOT NULL DEFAULT 1000,
    "ngnFee" DECIMAL(10,6) NOT NULL DEFAULT 0.2,
    "bonusFee" DECIMAL(10,6) NOT NULL DEFAULT 0.6,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChargeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRefund" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gateway" "TxnGatewayEnum" NOT NULL,
    "environment" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "providerRefundId" TEXT,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" "TxnCurrencyEnum" NOT NULL,
    "coinsDebit" DECIMAL(20,2) NOT NULL,
    "bonusDebit" DECIMAL(20,2) NOT NULL,
    "bonusShortfall" DECIMAL(20,2) NOT NULL,
    "shortfallValue" DECIMAL(20,6) NOT NULL,
    "baseRate" DECIMAL(20,6) NOT NULL,
    "bonusFee" DECIMAL(10,6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRefund_transactionId_key" ON "PurchaseRefund"("transactionId");

-- CreateIndex
CREATE INDEX "PurchaseRefund_status_updatedAt_idx" ON "PurchaseRefund"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "PurchaseRefund_userId_createdAt_idx" ON "PurchaseRefund"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRefund_gateway_environment_paymentId_key" ON "PurchaseRefund"("gateway", "environment", "paymentId");

-- AddForeignKey
ALTER TABLE "PurchaseRefund" ADD CONSTRAINT "PurchaseRefund_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


INSERT INTO "ChargeRate" ("id","updatedAt") VALUES ('default',CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
