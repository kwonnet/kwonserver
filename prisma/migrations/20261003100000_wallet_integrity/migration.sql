CREATE TABLE "WalletOperation" (
  "id" TEXT PRIMARY KEY,
  "scope" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- NOT VALID preserves historical evidence; new writes must satisfy the checks.
-- Reconcile historical exceptions before explicitly validating these constraints.
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_nonnegative_finite"
CHECK (credit >= 0 AND credit < 'Infinity'::float8 AND coins >= 0 AND coins < 'Infinity'::float8 AND bonus >= 0 AND bonus < 'Infinity'::float8) NOT VALID;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_nonnegative_finite"
CHECK (amount >= 0 AND amount < 'Infinity'::float8) NOT VALID;
