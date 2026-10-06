-- Keep existing inferred topics; model revision remains part of queue job IDs.
DROP INDEX IF EXISTS "Post_pending_deberta_topic_idx";
ALTER TABLE "Post" DROP COLUMN "topicModel";
