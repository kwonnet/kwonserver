BEGIN;
LOCK TABLE "CoinWithdrawal" IN ACCESS EXCLUSIVE MODE;

-- Fail rather than silently round or replace any historical amount.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "CoinWithdrawal"
    WHERE "receiveAmount"::numeric::text IN ('NaN', 'Infinity', '-Infinity')
      OR abs("receiveAmount"::numeric) >= 100000000000000000000
      OR "receiveAmount"::numeric <> round("receiveAmount"::numeric, 18)
  ) THEN
    RAISE EXCEPTION 'CoinWithdrawal.receiveAmount contains a value outside DECIMAL(38,18) precision';
  END IF;
END $$;

ALTER TABLE "CoinWithdrawal"
  ALTER COLUMN "receiveAmount" TYPE DECIMAL(38,18)
  USING "receiveAmount"::numeric;
COMMIT;
