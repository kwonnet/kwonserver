-- Keep existing topic values while the bounded background scan reclassifies them.
ALTER TABLE "Post" ADD COLUMN "topicModel" TEXT;
-- Sparse recovery index shrinks as the new classifier processes the backlog.
CREATE INDEX "Post_pending_deberta_topic_idx" ON "Post" (id)
WHERE (topic IS NULL OR "topicModel" IS NULL OR "topicModel" <> 'MoritzLaurer/deberta-v3-large-zeroshot-v1.1-all-33@c5dca3bda16d30337e493e3e3e5caa19a3e7c8c2')
  AND "deletedAt" IS NULL AND status IN ('PUBLISHED', 'SCHEDULED');
