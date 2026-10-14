ALTER TABLE "PurchaseRefund" ADD COLUMN "processingAttempts" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "processingUntil" TIMESTAMP(3);
