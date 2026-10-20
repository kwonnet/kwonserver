CREATE TABLE "AccountLevelBenefit" (
 level INTEGER PRIMARY KEY CHECK(level BETWEEN 0 AND 3),
 "postTipsShareBps" INTEGER NOT NULL CHECK("postTipsShareBps" BETWEEN 0 AND 10000),
 "accountGiftsShareBps" INTEGER NOT NULL CHECK("accountGiftsShareBps" BETWEEN 0 AND 10000),
 "chatGiftsShareBps" INTEGER NOT NULL CHECK("chatGiftsShareBps" BETWEEN 0 AND 10000),
 "postExposureTarget" INTEGER NOT NULL CHECK("postExposureTarget">0),
 "postExposureWindowHours" INTEGER NOT NULL DEFAULT 24 CHECK("postExposureWindowHours">0),
 "gamePointBoostBps" INTEGER NOT NULL CHECK("gamePointBoostBps" BETWEEN 0 AND 10000),
 "postQuizChargeBps" INTEGER NOT NULL CHECK("postQuizChargeBps" BETWEEN 0 AND 10000),
 "maxPostCharacters" INTEGER NOT NULL CHECK("maxPostCharacters">0),
 version INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "AccountLevelBenefit" (level,"postTipsShareBps","accountGiftsShareBps","chatGiftsShareBps","postExposureTarget","postExposureWindowHours","gamePointBoostBps","postQuizChargeBps","maxPostCharacters") VALUES
 (0,3000,3500,3500,150,24,0,2000,280),(1,4000,4500,4500,300,24,500,1750,25000),(2,4500,4800,4800,450,24,1000,1500,25000),(3,5000,5000,5000,600,24,1500,1250,25000);
ALTER TABLE "SubscriptionPlan" ADD COLUMN level INTEGER NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 3) REFERENCES "AccountLevelBenefit"(level);
UPDATE "SubscriptionPlan" SET level=CASE WHEN name IN ('Supreme','Pro') THEN 3 WHEN name='Premium' THEN 2 ELSE 1 END;
CREATE INDEX "Subscription_userId_isPrimary_status_endDate_idx" ON "Subscription"("userId","isPrimary",status,"endDate");
ALTER TABLE "PostBoost" ADD COLUMN "accountLevel" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "benefitsVersion" INTEGER NOT NULL DEFAULT 1;
CREATE OR REPLACE FUNCTION kwonnet_queue_post_boost() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE reach INTEGER; hours INTEGER; account_level INTEGER; policy_version INTEGER;
BEGIN
 IF NEW.status='PUBLISHED' AND NEW.kind='ROOT' AND NEW.scope='ANYONE' AND NOT NEW."isHidden" AND NEW."deletedAt" IS NULL
 AND (NEW."scheduleAt" IS NULL OR NEW."scheduleAt"<=CURRENT_TIMESTAMP)
 AND EXISTS(SELECT 1 FROM "User" WHERE id=NEW."userId" AND status='ACTIVE' AND NOT "isPrivate" AND "deletedAt" IS NULL AND "deactivatedAt" IS NULL) THEN
 SELECT b."postExposureTarget",b."postExposureWindowHours",b.level,b.version INTO reach,hours,account_level,policy_version FROM "AccountLevelBenefit" b WHERE b.level=COALESCE((SELECT p.level FROM "Subscription" s JOIN "SubscriptionPlan" p ON p.id=s."planId" WHERE s."userId"=NEW."userId" AND s."isPrimary" AND s.status='ACTIVE' AND s."startDate"<=CURRENT_TIMESTAMP AND s."endDate">CURRENT_TIMESTAMP ORDER BY s."endDate" DESC,s.id ASC LIMIT 1),0);
 INSERT INTO "PostBoost"("postId",target,"startsAt","expiresAt","accountLevel","benefitsVersion") VALUES(NEW.id,reach,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+make_interval(hours=>hours),account_level,policy_version) ON CONFLICT DO NOTHING;
 END IF; RETURN NEW;
END $$;
ALTER TABLE "SubscriptionPlan" DROP COLUMN "postBoostTarget";
ALTER TABLE "ChargeRate" DROP COLUMN "tipFee", DROP COLUMN "quizFee";

CREATE FUNCTION kwonnet_version_level_benefit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'version'-'updatedAt'-'createdAt') IS DISTINCT FROM (to_jsonb(OLD)-'version'-'updatedAt'-'createdAt') THEN NEW.version=OLD.version+1; ELSE NEW.version=OLD.version; END IF;
 NEW."updatedAt"=CURRENT_TIMESTAMP;RETURN NEW;
END $$;
CREATE TRIGGER kwonnet_version_level_benefit BEFORE UPDATE ON "AccountLevelBenefit" FOR EACH ROW EXECUTE FUNCTION kwonnet_version_level_benefit();
