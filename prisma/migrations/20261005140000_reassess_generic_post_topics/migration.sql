-- Previous cross-category softmax scores were compared to an absolute cutoff.
-- Requeue only fallback classifications through the existing bounded recovery job.
-- Preserve inferred categories, drafts, deleted posts, and all user content.
UPDATE "Post" SET topic = NULL
WHERE topic = 'generic' AND "deletedAt" IS NULL
  AND status IN ('PUBLISHED', 'SCHEDULED');
