-- Derived analytics only: existing posts and financial records are never rewritten.
CREATE TABLE "KwonnetAnalyticsSetup" (
  name TEXT PRIMARY KEY,
  cursor TEXT,
  "completedAt" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "PostTrendingEvent_postId_idx" ON "PostTrendingEvent" ("postId");

-- Extract visible Draft.js block text, never its entityMap/metadata. Also accept plain text.
CREATE OR REPLACE FUNCTION kwonnet_trend_text(raw TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE document JSONB;
BEGIN
  IF raw IS NULL OR raw = '' THEN RETURN ''; END IF;
  BEGIN document := raw::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN RETURN left(raw, 50000);
  END;
  IF jsonb_typeof(document) = 'string' THEN RETURN left(document #>> '{}', 50000); END IF;
  IF jsonb_typeof(document->'blocks') <> 'array' OR document->'blocks' IS NULL THEN RETURN ''; END IF;
  RETURN left(COALESCE((SELECT string_agg(block->>'text', E'\n' ORDER BY ordinal)
    FROM jsonb_array_elements(document->'blocks') WITH ORDINALITY AS b(block, ordinal)
    WHERE jsonb_typeof(block->'text') = 'string'), ''), 50000);
END $$;

CREATE OR REPLACE FUNCTION kwonnet_trend_keywords(raw TEXT)
RETURNS TABLE(keyword TEXT, is_hashtag BOOLEAN) LANGUAGE sql IMMUTABLE AS $$
WITH cleaned AS (
  SELECT lower(regexp_replace(regexp_replace(regexp_replace(kwonnet_trend_text(raw),
    'https?://[^[:space:]]+', ' ', 'gi'), '@[[:alnum:]_]+', ' ', 'g'), '<[^>]*>', ' ', 'g')) AS text
), tokens AS (
  SELECT ARRAY(SELECT word FROM regexp_split_to_table(trim(regexp_replace(text,
    '[^[:alnum:]_[:space:]]', ' ', 'g')), '[[:space:]]+') WITH ORDINALITY AS w(word, ordinal)
    WHERE word <> '' ORDER BY ordinal LIMIT 1000) AS words FROM cleaned
), candidates AS (
  SELECT m[1] AS keyword, true AS is_hashtag
  FROM cleaned, LATERAL regexp_matches(text, '#([[:alnum:]_]+)', 'g') m
  WHERE length(m[1]) BETWEEN 3 AND 160
  UNION ALL
  SELECT array_to_string(words[i:i+n-1], ' '), false
  FROM tokens, generate_series(1, 3) n,
    LATERAL generate_series(1, cardinality(words)-n+1) i
  WHERE NOT EXISTS (
    SELECT 1 FROM unnest(words[i:i+n-1]) word
    WHERE length(word) < 3 OR word !~ '^[[:alnum:]_]+$' OR word = ANY(ARRAY[
      'the','and','for','you','with','that','this','have','from','are','was','but','not','can','all',
      'out','get','has','her','his','one','our','who','new','now','day','time','like','just','know',
      'year','your','more','will','about','than','them','would','been','people','into','only','its',
      'there','what','when','which','their','said','after','over','also','could','other','how','then',
      'may','first','any','very','had','were','each','she','they'])
  )
)
SELECT keyword, bool_or(is_hashtag) FROM candidates
WHERE length(keyword) BETWEEN 3 AND 160 GROUP BY keyword;
$$;

-- One mention per post/keyword. Serialize edits and backfill on the source row.
CREATE OR REPLACE FUNCTION kwonnet_sync_post_trends(post_id TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE p "Post"%ROWTYPE;
BEGIN
  SELECT * INTO p FROM "Post" WHERE id = post_id FOR UPDATE;
  DELETE FROM "PostTrendingEvent" WHERE "postId" = post_id;
  IF p.id IS NULL OR p.status <> 'PUBLISHED' OR p."deletedAt" IS NOT NULL
    OR p."isHidden" OR p.scope <> 'ANYONE' OR p."parentId" IS NOT NULL OR p."rootId" IS NOT NULL
    OR p.kind <> 'ROOT' THEN RETURN; END IF;
  INSERT INTO "PostTrendingEvent" ("postId", "authorId", keyword, "createdAt", "countryId", "isHashtag")
  SELECT p.id, p."userId", k.keyword, p."createdAt" AT TIME ZONE 'UTC', p."countryId", k.is_hashtag
  FROM kwonnet_trend_keywords(p.content) k
  ON CONFLICT ("postId", keyword, "createdAt") DO UPDATE
    SET "authorId" = EXCLUDED."authorId", "countryId" = EXCLUDED."countryId", "isHashtag" = EXCLUDED."isHashtag";
END $$;

CREATE OR REPLACE FUNCTION kwonnet_post_trends_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "PostTrendingEvent" WHERE "postId" = OLD.id;
    RETURN OLD;
  END IF;
  PERFORM kwonnet_sync_post_trends(NEW.id);
  RETURN NEW;
END $$;

-- Replace the README's legacy trigger if an operator installed it manually.
-- Only triggers invoking that exact legacy function are retired; kwonrec is untouched.
DO $$ DECLARE t RECORD;
BEGIN
  FOR t IN SELECT tg.tgname FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
    WHERE tg.tgrelid = '"Post"'::regclass AND NOT tg.tgisinternal
      AND p.proname = 'extract_and_insert_keywords'
  LOOP EXECUTE format('DROP TRIGGER %I ON "Post"', t.tgname); END LOOP;
END $$;
CREATE TRIGGER kwonnet_post_trends_insert AFTER INSERT ON "Post"
  FOR EACH ROW EXECUTE FUNCTION kwonnet_post_trends_trigger();
CREATE TRIGGER kwonnet_post_trends_update AFTER UPDATE OF content, status, "deletedAt", "isHidden", scope,
  "countryId", "userId", "createdAt", "parentId", "rootId", kind ON "Post"
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION kwonnet_post_trends_trigger();
CREATE TRIGGER kwonnet_post_trends_delete AFTER DELETE ON "Post"
  FOR EACH ROW EXECUTE FUNCTION kwonnet_post_trends_trigger();
