-- AlterTable
ALTER TABLE "E2Member" ADD COLUMN     "unreadCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unseenCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "E2Blob" ADD COLUMN     "ciphertextSha256" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "discardedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "E2Delivery" (
    "messageId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),

    CONSTRAINT "E2Delivery_pkey" PRIMARY KEY ("messageId","userId")
);

-- CreateIndex
CREATE INDEX "E2Delivery_conversationId_userId_idx" ON "E2Delivery"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "E2Message_senderDeviceId_createdAt_idx" ON "E2Message"("senderDeviceId", "createdAt");

-- CreateIndex
CREATE INDEX "E2Message_expiresAt_idx" ON "E2Message"("expiresAt");

-- CreateIndex
CREATE INDEX "E2Blob_ownerDeviceId_createdAt_idx" ON "E2Blob"("ownerDeviceId", "createdAt");

-- CreateIndex
CREATE INDEX "E2Blob_expiresAt_idx" ON "E2Blob"("expiresAt");

-- CreateIndex
CREATE INDEX "E2Blob_discardedAt_idx" ON "E2Blob"("discardedAt");

-- CreateIndex
CREATE INDEX "E2Outbox_conversationId_targetDeviceId_event_sequence_idx" ON "E2Outbox"("conversationId", "targetDeviceId", "event", "sequence");

-- CreateIndex
CREATE INDEX "E2Outbox_createdAt_idx" ON "E2Outbox"("createdAt");

-- AddForeignKey
ALTER TABLE "E2Delivery" ADD CONSTRAINT "E2Delivery_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "E2Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "E2Delivery" ADD CONSTRAINT "E2Delivery_conversationId_userId_fkey" FOREIGN KEY ("conversationId", "userId") REFERENCES "E2Member"("conversationId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "E2Blob" ADD COLUMN "uploadGrantExpiresAt" TIMESTAMP(3);
UPDATE "E2Blob" SET "createdAt"=COALESCE("finalizedAt",now()) WHERE ciphertext IS NOT NULL;

-- Backfill account-level delivery state once per logical recipient, never per device.
INSERT INTO "E2Delivery" ("messageId", "conversationId", "userId", "deliveredAt", "readAt", "hiddenAt")
SELECT e."messageId", m."conversationId", d."userId", MIN(r."deliveredAt"), MIN(r."readAt"),
 CASE WHEN mem."hiddenAt" IS NOT NULL OR d."userId" = ANY(m."deletedFor") THEN COALESCE(mem."hiddenAt", now()) ELSE NULL END
FROM "E2Envelope" e
JOIN "E2Message" m ON m.id = e."messageId"
JOIN "E2Device" d ON d.id = e."recipientDeviceId"
JOIN "E2Device" sender ON sender.id = m."senderDeviceId"
JOIN "E2Member" mem ON mem."conversationId" = m."conversationId" AND mem."userId" = d."userId"
LEFT JOIN "E2Receipt" r ON r."messageId" = e."messageId" AND r."recipientDeviceId" = e."recipientDeviceId"
WHERE d."userId" <> sender."userId" AND m."expiresAt" > now()
GROUP BY e."messageId", m."conversationId", d."userId", mem."hiddenAt", m."deletedFor";
UPDATE "E2Member" mem SET "unreadCount" = totals.unread, "unseenCount" = totals.unseen
FROM (SELECT "conversationId", "userId", COUNT(*) FILTER (WHERE "readAt" IS NULL)::int AS unread,
 COUNT(*) FILTER (WHERE "deliveredAt" IS NULL)::int AS unseen
 FROM "E2Delivery" WHERE "hiddenAt" IS NULL GROUP BY "conversationId", "userId") totals
WHERE mem."conversationId" = totals."conversationId" AND mem."userId" = totals."userId" AND mem."hiddenAt" IS NULL;
ALTER TABLE "E2Member" ADD CONSTRAINT "E2Member_nonnegative_counters" CHECK ("unreadCount" >= 0 AND "unseenCount" >= 0 AND "unseenCount" <= "unreadCount");
-- Help the recovery worker claim only unpublished rows without scanning retained receipt history.
CREATE INDEX "E2Outbox_unpublished_ready" ON "E2Outbox" ("availableAt", "sequence") WHERE "publishedAt" IS NULL;
