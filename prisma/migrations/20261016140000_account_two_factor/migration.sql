ALTER TABLE "UserSession" ADD COLUMN "twoFactorVerifiedAt" TIMESTAMP(3);
CREATE TABLE "UserTwoFactor" (
  "userId" TEXT NOT NULL PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "secret" TEXT, "enabledAt" TIMESTAMP(3), "version" TEXT NOT NULL,
  "lastUsedStep" INTEGER, "recoveryCodeHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "pendingSecret" TEXT, "pendingId" TEXT, "pendingSessionId" TEXT,
  "pendingExpiresAt" TIMESTAMP(3), "pendingAttempts" INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE "AuthTwoFactorChallenge" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "tokenHash" TEXT NOT NULL, "factorVersion" TEXT NOT NULL, "provider" "AuthProvider" NOT NULL,
  "kind" TEXT NOT NULL, "sourceSessionId" TEXT, "passwordVersion" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0,
  "usedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AuthTwoFactorChallenge_tokenHash_key" ON "AuthTwoFactorChallenge"("tokenHash");
CREATE INDEX "AuthTwoFactorChallenge_userId_expiresAt_idx" ON "AuthTwoFactorChallenge"("userId", "expiresAt");
CREATE INDEX "AuthTwoFactorChallenge_expiresAt_idx" ON "AuthTwoFactorChallenge"("expiresAt");
