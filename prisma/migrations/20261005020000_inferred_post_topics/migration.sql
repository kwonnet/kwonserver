-- Re-infer edited text, including changes written outside the API.
CREATE FUNCTION kwonnet_reset_post_topic() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.content IS DISTINCT FROM NEW.content THEN NEW.topic := NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER kwonnet_reset_post_topic BEFORE UPDATE OF content ON "Post"
  FOR EACH ROW EXECUTE FUNCTION kwonnet_reset_post_topic();
-- Existing lexical labels were not semantic classifications: backfill them too.
UPDATE "Post" SET topic = NULL WHERE topic IS NOT NULL;
CREATE INDEX "Post_pending_topic_idx" ON "Post" (id)
  WHERE topic IS NULL AND "deletedAt" IS NULL AND status IN ('PUBLISHED', 'SCHEDULED');

-- Capture the author's country for new posts when no explicit country is stored.
CREATE FUNCTION kwonnet_post_author_country() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."countryId" IS NULL THEN
    SELECT "countryId" INTO NEW."countryId" FROM "User" WHERE id = NEW."userId";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER kwonnet_post_author_country BEFORE INSERT ON "Post"
  FOR EACH ROW EXECUTE FUNCTION kwonnet_post_author_country();
