CREATE TABLE "PostNotificationSubscription" (
  id TEXT PRIMARY KEY,
  "subscriberId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "authorId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostNotificationSubscription_no_self" CHECK ("subscriberId" <> "authorId")
);
CREATE UNIQUE INDEX "PostNotificationSubscription_subscriberId_authorId_key" ON "PostNotificationSubscription"("subscriberId", "authorId");
CREATE INDEX "PostNotificationSubscription_authorId_id_idx" ON "PostNotificationSubscription"("authorId", id);

CREATE TABLE "PostPublicationNotification" (
  "postId" TEXT PRIMARY KEY REFERENCES "Post"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "subscriberCursor" TEXT,
  "completedAt" TIMESTAMP(3)
);
CREATE INDEX "PostPublicationNotification_completedAt_createdAt_idx" ON "PostPublicationNotification"("completedAt", "createdAt");
ALTER TABLE "Notification" ADD COLUMN "sourceKey" TEXT;
ALTER TABLE "Notification" ADD COLUMN "pushDeliveredSubscriptionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE UNIQUE INDEX "Notification_sourceKey_key" ON "Notification"("sourceKey");
CREATE INDEX "Notification_recipientId_createdAt_idx" ON "Notification"("recipientId", "createdAt" DESC);

CREATE FUNCTION kwonnet_queue_publication_notification() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'PUBLISHED' AND NEW.kind IN ('ROOT', 'QUOTE') AND NEW."rootId" IS NULL
     AND NEW."deletedAt" IS NULL AND NOT NEW."isHidden"
     AND (TG_OP = 'INSERT' OR OLD.status IN ('DRAFT', 'SCHEDULED')) THEN
    INSERT INTO "PostPublicationNotification"("postId") VALUES (NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER kwonnet_queue_publication_notification
AFTER INSERT OR UPDATE OF status ON "Post" FOR EACH ROW
EXECUTE FUNCTION kwonnet_queue_publication_notification();
-- Intentionally no backfill: enabling notifications never sends historical posts.
