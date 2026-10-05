CREATE TYPE "EngagementAction" AS ENUM ('LIKE','COMMENT','REPOST','QUOTE','FOLLOW','FOLLOWERS','BOOKMARK','PUBLISH','LIKES_RECEIVED','COMMENTS_RECEIVED');
CREATE TABLE "EngagementTask" (id TEXT PRIMARY KEY, action "EngagementAction" UNIQUE NOT NULL, title TEXT NOT NULL,
 target INTEGER NOT NULL CHECK (target BETWEEN 1 AND 1000), reward INTEGER NOT NULL CHECK (reward BETWEEN 1 AND 15), enabled BOOLEAN NOT NULL DEFAULT true,
 "rewardDay" DATE NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT INTO "EngagementTask"(id,action,title,target,reward,"rewardDay") VALUES
 ('like','LIKE','Like posts',20,10,((NOW() AT TIME ZONE 'UTC')::date - 1)),
 ('comment','COMMENT','Comment on different posts',20,10,((NOW() AT TIME ZONE 'UTC')::date - 1)),
 ('repost','REPOST','Repost different posts',10,10,((NOW() AT TIME ZONE 'UTC')::date - 1)),
 ('quote','QUOTE','Quote different posts',5,10,((NOW() AT TIME ZONE 'UTC')::date - 1)),
 ('follow','FOLLOW','Follow people',5,10,((NOW() AT TIME ZONE 'UTC')::date - 1)),
 ('followers','FOLLOWERS','Gain new followers',3,10,((NOW() AT TIME ZONE 'UTC')::date - 1)),
 ('bookmark','BOOKMARK','Bookmark different posts',10,10,((NOW() AT TIME ZONE 'UTC')::date - 1)),
 ('publish','PUBLISH','Publish posts',2,10,((NOW() AT TIME ZONE 'UTC')::date - 1)),
 ('likes-received','LIKES_RECEIVED','Receive likes from different people',10,10,((NOW() AT TIME ZONE 'UTC')::date - 1)),
 ('comments-received','COMMENTS_RECEIVED','Receive comments from different people',5,10,((NOW() AT TIME ZONE 'UTC')::date - 1));
CREATE TABLE "EngagementClaim" (id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
 "taskId" TEXT NOT NULL REFERENCES "EngagementTask"(id), reward INTEGER NOT NULL, target INTEGER NOT NULL, "verifiedCount" INTEGER NOT NULL,
 "windowStart" TIMESTAMP(3) NOT NULL, "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "EngagementClaim_userId_taskId_claimedAt_idx" ON "EngagementClaim"("userId","taskId","claimedAt");
CREATE TABLE "EngagementCredit" ("userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE, "taskId" TEXT NOT NULL REFERENCES "EngagementTask"(id),
 "targetId" TEXT NOT NULL, "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY("userId","taskId","targetId"));
ALTER TABLE "SubscriptionPlan" ADD COLUMN "postBoostTarget" INTEGER NOT NULL DEFAULT 150 CHECK ("postBoostTarget" BETWEEN 150 AND 10000);
CREATE TABLE "PostBoost" ("postId" TEXT PRIMARY KEY REFERENCES "Post"(id) ON DELETE CASCADE, target INTEGER NOT NULL DEFAULT 150 CHECK (target BETWEEN 150 AND 10000),
 confirmed INTEGER NOT NULL DEFAULT 0 CHECK(confirmed >= 0), "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "PostBoost_expiresAt_confirmed_idx" ON "PostBoost"("expiresAt",confirmed);
CREATE TABLE "PostBoostDelivery" ("postId" TEXT NOT NULL REFERENCES "PostBoost"("postId") ON DELETE CASCADE, "viewerId" TEXT NOT NULL, "reservationKey" TEXT NOT NULL,
 "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "deliveredAt" TIMESTAMP(3), PRIMARY KEY("postId","viewerId"));
CREATE INDEX "PostBoostDelivery_viewerId_reservedAt_idx" ON "PostBoostDelivery"("viewerId","reservedAt");
CREATE TABLE "PostBoostView" ("postId" TEXT NOT NULL REFERENCES "PostBoost"("postId") ON DELETE CASCADE, "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY("postId","userId"));
CREATE TABLE "EmailMessage" (id TEXT PRIMARY KEY, "eventKey" TEXT UNIQUE NOT NULL, "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
 kind TEXT NOT NULL DEFAULT 'WELCOME', status TEXT NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leaseUntil" TIMESTAMP(3), "sentAt" TIMESTAMP(3), "lastErrorCode" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "EmailMessage_status_nextAttemptAt_idx" ON "EmailMessage"(status,"nextAttemptAt");
-- Publication starts the 24-hour window; never resurrect an expired boost after edits.
CREATE FUNCTION kwonnet_queue_post_boost() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE reach INTEGER;
BEGIN
 IF NEW.status = 'PUBLISHED' AND NEW.kind = 'ROOT' AND NEW.scope = 'ANYONE' AND NOT NEW."isHidden" AND NEW."deletedAt" IS NULL
 AND (NEW."scheduleAt" IS NULL OR NEW."scheduleAt" <= CURRENT_TIMESTAMP) AND EXISTS(SELECT 1 FROM "User" WHERE id=NEW."userId" AND status='ACTIVE' AND NOT "isPrivate" AND "deletedAt" IS NULL AND "deactivatedAt" IS NULL) THEN
   SELECT COALESCE(MAX(p."postBoostTarget"),150) INTO reach FROM "Subscription" s JOIN "SubscriptionPlan" p ON p.id=s."planId"
     WHERE s."userId"=NEW."userId" AND s.status IN ('ACTIVE','TRIAL') AND s."isPrimary" AND s."endDate">CURRENT_TIMESTAMP;
   INSERT INTO "PostBoost"("postId",target,"startsAt","expiresAt") VALUES(NEW.id,reach,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+INTERVAL '24 hours') ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER kwonnet_queue_post_boost AFTER INSERT OR UPDATE OF status,scope,"isHidden","deletedAt" ON "Post" FOR EACH ROW EXECUTE FUNCTION kwonnet_queue_post_boost();
-- Only recent eligible posts join the rollout; welcome emails are not backfilled.
INSERT INTO "PostBoost"("postId",target,"startsAt","expiresAt")
 SELECT p.id,150,p."createdAt",p."createdAt"+INTERVAL '24 hours' FROM "Post" p JOIN "User" u ON u.id=p."userId"
 WHERE p.status='PUBLISHED' AND p.kind='ROOT' AND p.scope='ANYONE' AND NOT p."isHidden" AND p."deletedAt" IS NULL AND p."createdAt">CURRENT_TIMESTAMP-INTERVAL '24 hours'
 AND p."createdAt"<=CURRENT_TIMESTAMP AND u.status='ACTIVE' AND NOT u."isPrivate" AND u."deletedAt" IS NULL AND u."deactivatedAt" IS NULL;
