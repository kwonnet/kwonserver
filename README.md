# Tests

Run `npm test` for unit and existing regression tests, or
`npm run test:unit:coverage` for the full source coverage report.
See [tests/README.md](tests/README.md) for setup, scope and remaining integration/E2E work.

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



## Removed payment integrations

Telegram bot/mini-app payments and TON wallet operations have been removed from the server. Internal wallets, coin purchases, subscriptions, transaction history, and Flutterwave payment flows remain.

The following routes are no longer registered (clients should remove these controls):

- `/v1/telegram/*`
- `/v1/crypto/addresses`
- `/v1/coins/invoices`
- `/v1/subscriptions/invoices`
- `/v1/wallets/proof`
- `/v1/wallets/addresses`
- `/v1/wallets/withdraw` (the previous implementation only supported TON)

New purchase requests reject retired currencies, payment gateways, and funding sources. Generic external transaction references use `meta.txnRef`. The coin-package response retains an empty `addresses` list for existing clients.

No database data is deleted. Existing migration history and historical ledger enum values remain readable. The old account identifier and address tables are excluded from Prisma Client with `@ignore`/`@@ignore`; these changes require client regeneration but produce an empty SQL migration. Do not remove historical enum values from a populated ledger without a separate data migration.

Remove obsolete `TELEGRAM_*`, `TON_*`, `TONKEEPER_*`, `SMART_GLOCAL_API_KEY`, and `UNLIMINT_API_KEY` secrets from deployment configuration. Local definitions were removed during this cleanup; no external secret store was changed. Deploy the regenerated Prisma Client and rebuilt JavaScript together, and restart running processes.

Run the focused regression checks with `npm run test:integrations`. Type-check the complete repository with `npx tsc --noEmit --rootDir .` (the existing base configuration includes the Prisma seed outside its `src` root).

### Recommendation newsfeed

`GET /api/v1/posts/feed/:feedType?limit=21` requires the user's existing login token. It calls kwonrec using `KWONREC_API` (local default `http://localhost:8001`) and `KWONREC_API_KEY`, then loads the ranked posts with PostgreSQL visibility checks. Set the same service key in `../kwonrec/.env`. The browser continues to call kwonserver and never receives that key.

From `../kwonrec`, run `docker compose build`, then `docker compose run --rm setup`, then `docker compose --profile connected up -d kwonrec worker`. Setup requires `KWONREC_DATABASE_URL` pointing to this application's database; use the direct endpoint for Neon. The worker continuously imports committed interactions and post changes. See `../kwonrec/README.md` for the retention and undo limitations.

Restart this server after environment changes. The feed response header `X-Feed-Source` reports `kwonrec` or `fallback`, and personalized responses disable caching. The existing response body is unchanged.

### Prisma build and database preparation

The project uses Prisma 6. The commands live in `package.json`; Docker and the release script invoke them at the appropriate stage:

| Command | Purpose |
| --- | --- |
| `npm run build` | Generate Prisma Client and compile the server and seed. Does not change the database. |
| `npm run db:migrate -- --name describe_change` | Create/apply migrations against a development database. Commit the resulting `prisma/migrations` files. |
| `npm run db:deploy` | Apply committed migrations with `prisma migrate deploy`, then seed reference data. Run once per release before starting new replicas. |
| `npm run db:setup` | Build, migrate, and seed in sequence for a fresh checkout with dependencies installed. |
| `npm run db:status` | Inspect migration status. |
| `npm run db:seed` | Rerun the compiled reference seed after building. |
| `npm run db:seed:topics` | Add missing seed topics to existing game categories only, after building the seed. |
| `npm run db:seed:demo` | Explicitly add demo users/posts for development; rejected when `NODE_ENV=production`. |

For a non-Docker deployment:

```sh
npm ci
npm run build
# Supply DATABASE_URL for the target database through the deployment environment.
npm run db:deploy
npm start
```

The database must support the `vector` extension used by the existing migrations. For Neon, use a direct connection for the release job if your pooled connection rejects migration or transaction operations. Do not use `migrate dev`, `db push`, or `migrate reset` as a production release step. Existing databases created without Prisma migration history need an intentional baseline before deploying migrations; do not reset them.

Docker generates Prisma Client for Linux during the build and includes the compiled seed, migration files, and Prisma CLI in the runtime image. Build the image, run a one-off release container, then deploy application replicas:

```sh
docker build -t kwonserver:release .
docker run --rm --env-file .env kwonserver:release npm run db:deploy
```

`kwoninfra/scripts/deploy.sh` now performs that release command using the selected kwonserver image before `compose up`. A failed migration or seed stops deployment. The `gcp-build` hook only builds; configure `npm run db:deploy` as the release step in other hosting pipelines as well. Application startup does not run migrations independently in every replica.

Reference seeding covers packages, milestones, games, subscription plans, and geography. It preserves existing data and only initializes empty reference tables. The reference phase is transactional and serialized with a database lock, so failures roll it back and exit unsuccessfully. Game category topics are an exception: each run adds missing seed topics to existing categories matched by game name and category name. Existing topics and empty topic definitions are preserved. Other partial seed data and existing pricing/catalog entries are not reconciled automatically. Demo data is opt-in and never part of `db:deploy`.

To backfill topics after editing `prisma/seed.ts`, from `kwonserver` run:

```sh
npm run build:seed
npm run db:seed:topics
```

This uses the configured `DATABASE_URL`, updates only existing category topic
arrays, and logs how many categories/topics were added and how many named seed
categories could not be found. It is additive and safe to rerun: it does not
remove old topics, recreate categories/rooms, or duplicate existing topics.
No schema migration is needed when only the topic values change. Matching uses
both game and category names, so renamed database categories need matching seed
names. Normal `db:seed`/`db:deploy` also perform this sync.

For Docker or a Cloud Run Job, rebuild/deploy an image containing the updated
seed first, then execute `npm run db:seed:topics` once with the target database
configuration. The Docker build already compiles the seed; do not run
`build:seed` inside the production image, which omits development dependencies.


After preparing a **new database**, run kwonrec's `docker compose run --rm setup` against it to install its separate outbox triggers and backfill the recommendation catalog, then start the recommendation worker. Prisma Client generation does not install those triggers.

### Local Docker Compose

`docker-compose.yml` uses the PostgreSQL, Redis, MongoDB, and other service settings already in `kwonserver/.env`. It joins the existing kwonrec Docker network, so its recommendation URL is `http://kwonrec:8001` inside Docker. Keep the same `KWONREC_API_KEY` in both projects. If kwonrec uses a custom Compose project name, set `KWONREC_NETWORK` to that project's network name (default: `kwonrec_default`).

Start the prepared recommendation stack first, then kwonserver:

```sh
cd ../kwonrec
docker compose --profile connected up -d kwonrec worker
cd ../kwonserver
docker compose up --build -d
```

Stop any host `npm run dev` process using port 8000 before starting the kwonserver container. The API is exposed at `http://127.0.0.1:8000`; kwonrec remains on port 8001. The `db-prepare` job applies committed Prisma migrations and seeds reference data; the API only starts after that job succeeds. For a fresh database, prepare the schema before running kwonrec's initial setup as described above.

Optionally set `DATABASE_MIGRATION_URL` in `kwonserver/.env` to a direct database connection for the preparation job; the app continues using `DATABASE_URL`. External databases must be reachable from Docker; `localhost` in a connection URL refers to the container itself.

```sh
docker compose logs -f db-prepare kwonserver
docker compose down
```

Stopping this Compose project leaves kwonrec and your external databases running.

`db-prepare` is a one-time job: `Exited (0)` means migrations and seeding succeeded, and it is expected to stop. The PostgreSQL database runs separately. Check `docker compose ps -a` for job exit codes and `docker compose logs db-prepare` for details.

The server image uses Debian because the native ONNX Runtime dependency requires glibc. Its runtime alias loader maps only `@/…` imports; bare names such as `redis` continue to resolve from `node_modules`.

For standalone `docker run`, generate a Docker CLI env file first:

```sh
node scripts/export-docker-env.cjs
docker run --rm --env-file .env.docker kwonserver:latest npm run db:deploy
```

Use `--env-file .env.docker` for the application container too. Regenerate it after changing `.env`. Docker CLI preserves surrounding quote characters, whereas Compose and dotenv interpret them; passing a quoted database URL directly through `docker run --env-file .env` causes Prisma P1012. The generated file contains secrets, has owner-only permissions, and is excluded from Git and Docker builds. Compose continues using `.env`.
