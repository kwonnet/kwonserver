# Postgresql Extensions
Please enable these postgresql extensions
### 1. Pgvector

To install [pgvector](https://github.com/pgvector/pgvector)
Then follow the instructions

### 2. Timescaledb for analytical and timesearies data
[timescaledb](https://www.tigerdata.com/docs/self-hosted/latest/install/installation-macos#add-the-timescale_db-extension-to-your-database)

#### Add timescaledb via docker

```bash
docker pull timescale/timescaledb-ha:pg18
```

```bash
docker run -d --name timescaledb -p 5433:5432  -v /app/data/postgresl:/pgdata -e PGDATA=/pgdata -e POSTGRES_PASSWORD=12345678 timescale/timescaledb-ha:pg18
```

<!-- To connect to timescale db -->

```bash
postgresql://postgres:12345678@timescaledb:5433/kwonnet
```


## Process of turning your db content into n-grams to capture trending topics


### Step 1 -  Create hypertable function

```sql
SELECT create_hypertable('"PostTrendingEvent"', 'createdAt', chunk_time_interval => INTERVAL '1 day');
```

### Step 2 - Create function

```sql
CREATE OR REPLACE FUNCTION extract_and_insert_keywords()
RETURNS TRIGGER AS $$
DECLARE
  clean_text TEXT;
  words TEXT[];
  kw TEXT;
BEGIN
  -- Skip if not published or no content
  IF NEW.status != 'PUBLISHED' OR NEW.content IS NULL OR NEW.content = '' THEN
    RETURN NEW;
  END IF;

  -- Clean content
  clean_text := regexp_replace(
    regexp_replace(
      regexp_replace(lower(NEW.content), 'https?://\S+', '', 'g'),
      '@\w+', '', 'g'
    ),
    '[^\w\s]', ' ', 'g'
  );
  clean_text := regexp_replace(clean_text, '\s+', ' ', 'g');
  words := regexp_split_to_array(trim(clean_text), '\s+');

  -- Insert hashtags
  FOR kw IN
    SELECT lower(substr(m[1], 2)) FROM regexp_matches(NEW.content, '#(\w+)', 'g') m
  LOOP
    IF length(kw) >= 3 THEN
      INSERT INTO "PostTrendingEvent" ("createdAt", "postId", "authorId", keyword, "countryId", "isHashtag")
      VALUES (NEW."createdAt", NEW.id, NEW."userId", kw, NEW."countryId", true)
      ON CONFLICT ("postId", keyword, "createdAt") DO NOTHING;
    END IF;
  END LOOP;

  -- Unigrams
  FOR kw IN SELECT unnest(words)
  LOOP
    IF length(kw) >= 3 AND kw ~ '^[a-z0-9]+$' AND kw NOT IN ('the','and','for','you','with','that','this','have','from','are','was','but','not','can','all','out','get','has','her','his','one','our','who','new','now','day','time','like','just','know','year','your','more','will','about','than','them','would','been','people','into','only','its','there','what','when','which','their','said','after','over','also','could','other','how','then','may','first','any','very','had','were','each','she','they') THEN
      INSERT INTO "PostTrendingEvent" ("createdAt", "postId", "authorId", keyword, "countryId", "isHashtag")
      VALUES (NEW."createdAt", NEW.id, NEW."userId", kw, NEW."countryId", false)
      ON CONFLICT ("postId", keyword, "createdAt") DO NOTHING;
    END IF;
  END LOOP;

  -- Bigrams and Trigrams (similar loop using generate_series)
  -- ... (same as before, using INSERT with NEW.column)

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### step 3. Re-create Continuous Aggregates (Best Version)

```sql
-- Drop old
DROP MATERIALIZED VIEW IF EXISTS trending_keywords_daily CASCADE;
DROP MATERIALIZED VIEW IF EXISTS trending_keywords_hourly CASCADE;

-- Hourly: all metrics we need
CREATE MATERIALIZED VIEW trending_keywords_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', "createdAt") AS bucket,
  keyword,
  COALESCE("countryId", 'global') AS country,
  COUNT(*) AS mentions,                          -- total occurrences
  COUNT(DISTINCT "postId") AS unique_posts,      -- unique posts
  COUNT(DISTINCT "authorId") AS unique_users     -- unique users
FROM "PostTrendingEvent"
GROUP BY bucket, keyword, country;

SELECT add_continuous_aggregate_policy('trending_keywords_hourly',
  start_offset => INTERVAL '3 months',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour');

-- Daily aggregate (on hourly) — repeat time_bucket exactly
CREATE MATERIALIZED VIEW trending_keywords_daily
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', bucket) AS bucket,
  keyword,
  country,
  SUM(mentions) AS mentions,
  SUM(unique_posts) AS unique_posts,
  SUM(unique_users) AS unique_users
FROM trending_keywords_hourly
GROUP BY time_bucket('1 day', bucket), keyword, country;

SELECT add_continuous_aggregate_policy('trending_keywords_daily',
  start_offset => INTERVAL '1 year',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day');

```

### Step 4 - Refresh to Populate

```sql
CALL refresh_continuous_aggregate('trending_keywords_hourly', NULL, NULL);
CALL refresh_continuous_aggregate('trending_keywords_daily', NULL, NULL);

```



### Copy existing data

```sql
    INSERT INTO "PostTrendingEvent" ("createdAt", "postId", "authorId", keyword, "countryId", "isHashtag")
SELECT
  p."createdAt",
  p.id AS "postId",
  p."userId" AS "authorId",
  kw.keyword,
  p."countryId",
  kw.is_hashtag
FROM "Post" p
CROSS JOIN LATERAL (
  -- Hashtags
  SELECT 
    lower(substr(m[1], 2)) AS keyword,
    true AS is_hashtag
  FROM regexp_matches(COALESCE(p.content, ''), '#(\w+)', 'g') m
  WHERE length(lower(substr(m[1], 2))) >= 3

  UNION ALL

  -- Unigrams + Bigrams + Trigrams (cleaned)
  SELECT 
    word AS keyword,
    false AS is_hashtag
  FROM (
    SELECT regexp_replace(
      regexp_replace(
        regexp_replace(lower(COALESCE(p.content, '')), 'https?://\S+', '', 'g'),
        '@\w+', '', 'g'
      ),
      '[^\w\s]', ' ', 'g'
    ) AS cleaned_text
  ) ct,
  LATERAL unnest(regexp_split_to_array(regexp_replace(ct.cleaned_text, '\s+', ' ', 'g'), '\s+')) AS word
  WHERE length(trim(word)) >= 3
    AND trim(word) ~ '^[a-z0-9]+$'
    AND trim(word) NOT IN ('the','and','for','you','with','that','this','have','from','are','was','but','not','can','all','out','get','has','her','his','one','our','who','new','now','day','time','like','just','know','year','your','more','will','about','than','them','would','been','people','into','only','its','there','what','when','which','their','said','after','over','also','could','other','how','then','may','first','any','very','had','were','each','she','they')

  UNION ALL

  -- Bigrams
  SELECT 
    words[i] || ' ' || words[i+1] AS keyword,
    false AS is_hashtag
  FROM (
    SELECT regexp_split_to_array(regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(COALESCE(p.content, '')), 'https?://\S+', '', 'g'),
          '@\w+', '', 'g'
        ),
        '[^\w\s]', ' ', 'g'
      ), '\s+', ' ', 'g'), '\s+') AS words
  ) w,
  generate_series(1, array_upper(w.words, 1) - 1) i
  WHERE length(w.words[i] || w.words[i+1]) >= 7

  UNION ALL

  -- Trigrams
  SELECT 
    words[i] || ' ' || words[i+1] || ' ' || words[i+2] AS keyword,
    false AS is_hashtag
  FROM (
    SELECT regexp_split_to_array(regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(COALESCE(p.content, '')), 'https?://\S+', '', 'g'),
          '@\w+', '', 'g'
        ),
        '[^\w\s]', ' ', 'g'
      ), '\s+', ' ', 'g'), '\s+') AS words
  ) w,
  generate_series(1, array_upper(w.words, 1) - 2) i
  WHERE length(w.words[i] || w.words[i+1] || w.words[i+2]) >= 10
) kw
WHERE p.status = 'PUBLISHED'
  AND p."deletedAt" IS NULL
  AND (p.content IS NOT NULL AND p.content <> '')
ON CONFLICT ("postId", keyword, "createdAt") DO NOTHING;
```

### For local testing - manually refresh the aggregate functions

```sql
-- Refresh hourly aggregate (full history)
CALL refresh_continuous_aggregate('trending_keywords_hourly', NULL, NULL);

-- Refresh daily aggregate
CALL refresh_continuous_aggregate('trending_keywords_daily', NULL, NULL);

```

### To Query Your Live Trending Topics!

