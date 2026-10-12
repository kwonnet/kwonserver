ALTER TYPE "TxnGatewayEnum" ADD VALUE 'BACHS';
CREATE TABLE "BachsCheckout" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "currency" "TxnCurrencyEnum" NOT NULL,
  "amount" DECIMAL(20,2) NOT NULL,
  "coins" DECIMAL(20,2) NOT NULL,
  "bonus" DECIMAL(20,2) NOT NULL,
  "request" JSONB NOT NULL,
  "checkoutId" TEXT,
  "checkoutUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3),
  CONSTRAINT "BachsCheckout_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BachsCheckout_checkoutId_key" ON "BachsCheckout"("checkoutId");
CREATE INDEX "BachsCheckout_userId_createdAt_idx" ON "BachsCheckout"("userId", "createdAt");

ALTER TABLE "BachsCheckout" ADD CONSTRAINT "BachsCheckout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BachsCheckout" ADD CONSTRAINT "BachsCheckout_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "CoinPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
