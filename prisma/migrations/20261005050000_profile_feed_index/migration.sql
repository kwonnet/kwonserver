-- Profile tabs filter by author and status before ordering their page.
CREATE INDEX IF NOT EXISTS "Post_profile_feed_idx"
ON "Post" ("userId", "status", "createdAt" DESC, "id" DESC);
