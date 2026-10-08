ALTER TABLE "User" RENAME COLUMN "verifiedAt" TO "emailVerifiedAt";
UPDATE "User" SET "emailVerifiedAt" = COALESCE("emailVerifiedAt", "createdAt", CURRENT_TIMESTAMP);
UPDATE "User" SET "identityVerifiedAt" = COALESCE("identityVerifiedAt", "createdAt", CURRENT_TIMESTAMP) WHERE "identityVerified";
UPDATE "User" SET "accountVerifiedAt" = COALESCE("accountVerifiedAt", "createdAt", CURRENT_TIMESTAMP) WHERE "accountVerified";
ALTER TABLE "User" DROP COLUMN "isVerified", DROP COLUMN "identityVerified", DROP COLUMN "accountVerified";
CREATE TABLE "AuthEmailToken" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
 "purpose" TEXT NOT NULL, "tokenHash" TEXT NOT NULL UNIQUE, "encryptedToken" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuthEmailToken_userId_purpose_createdAt_idx" ON "AuthEmailToken"("userId", "purpose", "createdAt");
ALTER TABLE "EmailMessage" ADD COLUMN "actionTokenId" TEXT;

