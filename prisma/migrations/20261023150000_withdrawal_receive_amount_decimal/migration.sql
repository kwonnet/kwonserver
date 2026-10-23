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

-- Expand rather than changing the type read by the currently running release.
ALTER TABLE "CoinWithdrawal" ADD COLUMN "receiveAmountNumeric" DECIMAL(38,18);
ALTER TABLE "CoinWithdrawal" ALTER COLUMN "receiveAmount" SET DEFAULT '';
UPDATE "CoinWithdrawal" SET "receiveAmountNumeric" = "receiveAmount"::numeric;

-- Old releases write text; new releases write numeric. Keep rollback compatible.
CREATE OR REPLACE FUNCTION sync_withdrawal_receive_amount() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  legacy_changed boolean;
  numeric_changed boolean;
  exact_amount numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    legacy_changed := NEW."receiveAmount" IS NOT NULL AND NEW."receiveAmount" <> '';
    numeric_changed := NEW."receiveAmountNumeric" IS NOT NULL;
  ELSE
    legacy_changed := NEW."receiveAmount" IS DISTINCT FROM OLD."receiveAmount";
    numeric_changed := NEW."receiveAmountNumeric" IS DISTINCT FROM OLD."receiveAmountNumeric";
  END IF;

  IF legacy_changed THEN
    exact_amount := NEW."receiveAmount"::numeric;
    IF exact_amount IS NULL OR exact_amount::text IN ('NaN','Infinity','-Infinity')
      OR abs(exact_amount) >= 100000000000000000000
      OR exact_amount <> round(exact_amount,18) THEN
      RAISE EXCEPTION 'Invalid withdrawal receive amount';
    END IF;
    IF numeric_changed AND NEW."receiveAmountNumeric" IS DISTINCT FROM exact_amount THEN
      RAISE EXCEPTION 'Conflicting withdrawal receive amounts';
    END IF;
    NEW."receiveAmountNumeric" := exact_amount;
  ELSIF numeric_changed THEN
    NEW."receiveAmount" := NEW."receiveAmountNumeric"::text;
  END IF;

  IF NEW."receiveAmountNumeric" IS NULL OR NEW."receiveAmountNumeric"::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Invalid withdrawal receive amount';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER withdrawal_receive_amount_sync
  BEFORE INSERT OR UPDATE ON "CoinWithdrawal"
  FOR EACH ROW EXECUTE FUNCTION sync_withdrawal_receive_amount();
COMMIT;
