CREATE TABLE "E2Recovery" (
 "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
 "passcodeHash" TEXT NOT NULL, "wrappedSecret" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "E2HistoryBackup" (
 "id" UUID PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "deviceId" UUID NOT NULL, "objectKey" TEXT NOT NULL UNIQUE, "bytes" INTEGER NOT NULL,
 "finalizedAt" TIMESTAMP(3), "discardedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "E2HistoryBackup_userId_deviceId_finalizedAt_idx" ON "E2HistoryBackup"("userId","deviceId","finalizedAt");
