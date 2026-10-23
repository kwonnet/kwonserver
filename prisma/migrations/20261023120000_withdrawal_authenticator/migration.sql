ALTER TABLE "CoinWithdrawal"
  ADD COLUMN "authorizationMethod" TEXT,
  ADD COLUMN "authorizationFactorVersion" TEXT,
  ADD COLUMN "authorizationCodeHash" TEXT,
  ADD COLUMN "authorizationAttempts" INTEGER NOT NULL DEFAULT 0;
