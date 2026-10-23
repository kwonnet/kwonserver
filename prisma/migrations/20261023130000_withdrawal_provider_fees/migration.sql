ALTER TABLE "CoinWithdrawal"
  ADD COLUMN "estimatedProviderFee" DECIMAL(30,12),
  ADD COLUMN "estimatedProviderFeeCurrency" TEXT,
  ADD COLUMN "estimatedProviderFeeIncludesConversion" BOOLEAN,
  ADD COLUMN "providerFee" DECIMAL(30,12),
  ADD COLUMN "providerFeeCurrency" TEXT,
  ADD COLUMN "providerFeeIncludesConversion" BOOLEAN,
  ADD COLUMN "providerFeeSource" TEXT,
  ADD COLUMN "providerConversionFee" DECIMAL(30,12),
  ADD COLUMN "providerConversionFeeCurrency" TEXT,
  ADD COLUMN "providerFeesRecordedAt" TIMESTAMP(3);

-- Existing Bachs successes can be reconciled only after recovery completed.
-- Numeric guards are inside CASE so malformed historical JSON is never cast.
WITH amounts AS (
  SELECT id,
    CASE WHEN "providerData"->>'fundingAmount' ~ '^[0-9]{1,16}(\.[0-9]{1,12})?$'
      THEN ("providerData"->>'fundingAmount')::numeric END AS funded,
    CASE WHEN "providerData"->>'sourceAmount' ~ '^[0-9]{1,16}(\.[0-9]{1,12})?$'
      THEN ("providerData"->>'sourceAmount')::numeric END AS principal,
    CASE WHEN "providerData"->>'recoveryAmount' ~ '^[0-9]{1,16}(\.[0-9]{1,12})?$'
      THEN ("providerData"->>'recoveryAmount')::numeric END AS recovered
  FROM "CoinWithdrawal"
  WHERE gateway = 'BACHS' AND status = 'SUCCEEDED'
    AND "providerData"->>'recovered' = 'true'
)
UPDATE "CoinWithdrawal" w SET
  "providerFee" = a.funded - a.principal - a.recovered,
  "providerFeeCurrency" = w.currency,
  "providerFeeSource" = 'RECOVERED_BALANCE',
  "providerFeesRecordedAt" = CURRENT_TIMESTAMP
FROM amounts a WHERE w.id = a.id AND a.funded >= a.principal + a.recovered;

-- Historical native stablecoin gross-ups are estimates, not provider receipts.
WITH amounts AS (
  SELECT id,
    CASE WHEN "providerData"#>>'{request,amount}' ~ '^[0-9]{1,16}(\.[0-9]{1,12})?$'
      THEN ("providerData"#>>'{request,amount}')::numeric END AS gross,
    CASE WHEN "receiveAmount" ~ '^[0-9]{1,16}(\.[0-9]{1,12})?$'
      THEN "receiveAmount"::numeric END AS net
  FROM "CoinWithdrawal" WHERE gateway = 'FLUTTERWAVE'
    AND "providerData"#>>'{request,currency}' IN ('USDT','USDC','RLUSD')
    AND "providerData"#>>'{request,debit_currency}' = "providerData"#>>'{request,currency}'
    AND "receiveCurrency" = "providerData"#>>'{request,currency}'
)
UPDATE "CoinWithdrawal" w SET
  "estimatedProviderFee" = a.gross - a.net,
  "estimatedProviderFeeCurrency" = w."receiveCurrency",
  "estimatedProviderFeeIncludesConversion" = false
FROM amounts a WHERE w.id = a.id AND a.gross >= a.net;
