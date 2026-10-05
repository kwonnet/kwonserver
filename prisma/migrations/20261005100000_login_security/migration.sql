CREATE TYPE "AuthProvider" AS ENUM ('PASSWORD', 'GOOGLE', 'LEGACY');

CREATE TABLE "AuthIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "identityId" TEXT,
    "provider" "AuthProvider" NOT NULL,
    "device" JSONB NOT NULL,
    "location" JSONB,
    "ipAddress" TEXT,
    "ipHash" TEXT,
    "metadataSource" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "retainUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoginEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "provider" "AuthProvider" NOT NULL,
    "kind" TEXT NOT NULL,
    "device" JSONB NOT NULL,
    "location" JSONB,
    "ipAddress" TEXT,
    "ipHash" TEXT,
    "metadataSource" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retainUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthIdentity_provider_providerAccountId_key" ON "AuthIdentity"("provider", "providerAccountId");

CREATE UNIQUE INDEX "AuthIdentity_userId_provider_key" ON "AuthIdentity"("userId", "provider");

CREATE INDEX "UserSession_userId_revokedAt_expiresAt_idx" ON "UserSession"("userId", "revokedAt", "expiresAt");

CREATE INDEX "UserSession_retainUntil_idx" ON "UserSession"("retainUntil");

CREATE INDEX "LoginEvent_userId_createdAt_id_idx" ON "LoginEvent"("userId", "createdAt" DESC, "id" DESC);

CREATE INDEX "LoginEvent_sessionId_idx" ON "LoginEvent"("sessionId");

CREATE INDEX "LoginEvent_retainUntil_idx" ON "LoginEvent"("retainUntil");

ALTER TABLE "AuthIdentity" ADD CONSTRAINT "AuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "AuthIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LoginEvent" ADD CONSTRAINT "LoginEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LoginEvent" ADD CONSTRAINT "LoginEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UserSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Additive backfill: existing authentication fields stay authoritative.
INSERT INTO "AuthIdentity" (id, "userId", provider, "providerAccountId")
SELECT 'password-' || id, id, 'PASSWORD', id FROM "User" WHERE password IS NOT NULL AND password <> ''
ON CONFLICT DO NOTHING;
INSERT INTO "AuthIdentity" (id, "userId", provider, "providerAccountId")
SELECT 'google-' || id, id, 'GOOGLE', "googleSubject" FROM "User" WHERE "googleSubject" IS NOT NULL
ON CONFLICT DO NOTHING;
