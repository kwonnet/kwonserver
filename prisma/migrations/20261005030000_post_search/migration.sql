-- Reuse the immutable rendered-text extractor so editor metadata is never indexed.
CREATE INDEX "Post_public_search_idx" ON "Post" USING GIN
  (to_tsvector('simple', kwonnet_trend_text(content)))
  WHERE status = 'PUBLISHED' AND scope = 'ANYONE' AND kind = 'ROOT'
    AND "deletedAt" IS NULL AND NOT "isHidden";
