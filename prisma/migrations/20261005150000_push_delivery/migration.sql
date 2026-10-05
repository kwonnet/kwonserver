ALTER TABLE "PushNotification" ADD COLUMN "endpoint" TEXT;
UPDATE "PushNotification" SET endpoint = config->>'endpoint' WHERE jsonb_typeof(config->'endpoint') = 'string';
DELETE FROM "PushNotification" WHERE id IN (
 SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY endpoint ORDER BY "updatedAt" DESC NULLS LAST, id DESC) AS n
 FROM "PushNotification" WHERE endpoint IS NOT NULL) duplicates WHERE n > 1
);
CREATE UNIQUE INDEX "PushNotification_endpoint_key" ON "PushNotification"(endpoint);
ALTER TABLE "Notification" ADD COLUMN "pushSentAt" TIMESTAMP(3), ADD COLUMN "pushAttempts" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "nextPushAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- Do not send historical notifications when enabling delivery.
UPDATE "Notification" SET "pushSentAt" = CURRENT_TIMESTAMP;
CREATE INDEX "Notification_pushSentAt_nextPushAttemptAt_idx" ON "Notification"("pushSentAt", "nextPushAttemptAt");
CREATE INDEX "Post_due_schedule_idx" ON "Post"("scheduleAt") WHERE status = 'SCHEDULED' AND "deletedAt" IS NULL;

-- Older scheduled replies/quotes already incremented counts at creation.
ALTER TABLE "Post" ADD COLUMN "scheduledEffectsPending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PushNotification" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "PushNotification" ADD CONSTRAINT "PushNotification_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UserSession"(id) ON DELETE CASCADE ON UPDATE CASCADE;
