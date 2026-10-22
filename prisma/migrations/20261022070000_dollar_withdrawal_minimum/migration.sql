-- Change the default for new charge-rate rows only. Existing values are managed manually.
ALTER TABLE "ChargeRate" ALTER COLUMN "minWithdrawal" SET DEFAULT 10;
