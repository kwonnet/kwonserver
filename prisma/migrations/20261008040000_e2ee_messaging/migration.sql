-- CreateEnum
CREATE TYPE "E2ConversationState" AS ENUM ('PENDING_REQUEST', 'ACCEPTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "E2MessageStatus" AS ENUM ('SENT', 'DELIVERED', 'READ');

-- CreateTable
CREATE TABLE "E2Device" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "signalDeviceId" INTEGER NOT NULL,
    "registrationId" INTEGER NOT NULL,
    "identityPublic" BYTEA NOT NULL,
    "actionSigningPublic" BYTEA NOT NULL,
    "bundleVersion" INTEGER NOT NULL DEFAULT 1,
    "revokedAt" TIMESTAMP(3),
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedFor" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "E2Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "E2SignedPreKey" (
    "deviceId" UUID NOT NULL,
    "keyId" INTEGER NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "signature" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "E2SignedPreKey_pkey" PRIMARY KEY ("deviceId","keyId")
);

-- CreateTable
CREATE TABLE "E2OneTimePreKey" (
    "deviceId" UUID NOT NULL,
    "keyId" INTEGER NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "claimId" UUID,
    "claimedByDeviceId" UUID,

    CONSTRAINT "E2OneTimePreKey_pkey" PRIMARY KEY ("deviceId","keyId")
);

-- CreateTable
CREATE TABLE "E2Conversation" (
    "id" UUID NOT NULL,
    "pairKey" TEXT NOT NULL,
    "state" "E2ConversationState" NOT NULL DEFAULT 'PENDING_REQUEST',
    "initiatorId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL DEFAULT 1,
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "E2Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "E2Member" (
    "conversationId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3),
    "clearedBefore" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "E2Member_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "E2Message" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderDeviceId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "requestDigest" BYTEA NOT NULL,
    "serverSequence" BIGSERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deletedFor" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "E2Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "E2Envelope" (
    "messageId" UUID NOT NULL,
    "recipientDeviceId" UUID NOT NULL,
    "wireType" INTEGER NOT NULL,
    "ciphertext" BYTEA NOT NULL,

    CONSTRAINT "E2Envelope_pkey" PRIMARY KEY ("messageId","recipientDeviceId")
);

-- CreateTable
CREATE TABLE "E2Receipt" (
    "messageId" UUID NOT NULL,
    "recipientDeviceId" UUID NOT NULL,
    "status" "E2MessageStatus" NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "E2Receipt_pkey" PRIMARY KEY ("messageId","recipientDeviceId")
);

-- CreateTable
CREATE TABLE "E2Blob" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "ownerDeviceId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "ciphertext" BYTEA,
    "ciphertextBytes" BIGINT NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "E2Blob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "E2Outbox" (
    "sequence" BIGSERIAL NOT NULL,
    "id" UUID NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "conversationId" UUID NOT NULL,
    "targetDeviceId" UUID NOT NULL,
    "expectedEpoch" INTEGER NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "E2Outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "E2PreKeyClaim" (
    "id" UUID NOT NULL,
    "requesterDeviceId" UUID NOT NULL,
    "targetDeviceId" UUID NOT NULL,
    "bundle" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "E2PreKeyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "E2Device_userId_signalDeviceId_key" ON "E2Device"("userId", "signalDeviceId");

-- CreateIndex
CREATE INDEX "E2OneTimePreKey_deviceId_claimedAt_keyId_idx" ON "E2OneTimePreKey"("deviceId", "claimedAt", "keyId");

-- CreateIndex
CREATE UNIQUE INDEX "E2Conversation_pairKey_key" ON "E2Conversation"("pairKey");

-- CreateIndex
CREATE INDEX "E2Member_userId_hiddenAt_idx" ON "E2Member"("userId", "hiddenAt");

-- CreateIndex
CREATE UNIQUE INDEX "E2Message_serverSequence_key" ON "E2Message"("serverSequence");

-- CreateIndex
CREATE INDEX "E2Message_conversationId_serverSequence_idx" ON "E2Message"("conversationId", "serverSequence");

-- CreateIndex
CREATE UNIQUE INDEX "E2Message_senderDeviceId_clientId_key" ON "E2Message"("senderDeviceId", "clientId");

-- CreateIndex
CREATE INDEX "E2Envelope_recipientDeviceId_messageId_idx" ON "E2Envelope"("recipientDeviceId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "E2Blob_objectKey_key" ON "E2Blob"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "E2Outbox_sequence_key" ON "E2Outbox"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "E2Outbox_dedupeKey_key" ON "E2Outbox"("dedupeKey");

-- CreateIndex
CREATE INDEX "E2Outbox_publishedAt_availableAt_leaseUntil_idx" ON "E2Outbox"("publishedAt", "availableAt", "leaseUntil");

-- AddForeignKey
ALTER TABLE "E2Device" ADD CONSTRAINT "E2Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "E2SignedPreKey" ADD CONSTRAINT "E2SignedPreKey_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "E2Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "E2OneTimePreKey" ADD CONSTRAINT "E2OneTimePreKey_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "E2Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "E2Member" ADD CONSTRAINT "E2Member_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "E2Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "E2Member" ADD CONSTRAINT "E2Member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "E2Message" ADD CONSTRAINT "E2Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "E2Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "E2Message" ADD CONSTRAINT "E2Message_senderDeviceId_fkey" FOREIGN KEY ("senderDeviceId") REFERENCES "E2Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "E2Envelope" ADD CONSTRAINT "E2Envelope_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "E2Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "E2Envelope" ADD CONSTRAINT "E2Envelope_recipientDeviceId_fkey" FOREIGN KEY ("recipientDeviceId") REFERENCES "E2Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "E2Receipt" ADD CONSTRAINT "E2Receipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "E2Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "E2Receipt" ADD CONSTRAINT "E2Receipt_recipientDeviceId_fkey" FOREIGN KEY ("recipientDeviceId") REFERENCES "E2Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "E2Blob" ADD CONSTRAINT "E2Blob_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "E2Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

