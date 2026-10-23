-- Label only proven historical email authorizations; never infer from status alone.
UPDATE "CoinWithdrawal" w
SET "authorizationMethod" = 'EMAIL'
FROM "AuthEmailToken" t
WHERE w."authorizationMethod" IS NULL
  AND w."otpVerifiedAt" IS NOT NULL
  AND w."authorizationFactorVersion" IS NULL
  AND w."authorizationCodeHash" IS NULL
  AND w."otpChallengeId" = t.id
  AND t."userId" = w."userId"
  AND t."subjectId" = w.id
  AND t.purpose = 'WITHDRAWAL_OTP'
  AND t."usedAt" IS NOT NULL;
