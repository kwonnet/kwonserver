# Tests

Run `npm test` for unit and existing regression tests, or
`npm run test:unit:coverage` for the full source coverage report.
See [tests/README.md](tests/README.md) for setup, scope and remaining integration/E2E work.

# PostgreSQL extensions and trending topics

Database preparation is automatic in `npm run db:deploy`, already invoked by the
Compute Engine release, local Compose `db-prepare`, and other documented release
flows. It uses the existing `DATABASE_URL`, or `DATABASE_MIGRATION_URL` when set.
Use a **direct/session connection** for this release step; a transaction pooler
cannot retain the setup lock. The API continues to use `DATABASE_URL` normally.
No database provider, credentials, Docker volume, or financial data is changed.
For a Neon pooled URL, the release automatically selects its documented direct
endpoint for the same database, preserving pooling for the API. For other
transaction poolers, supply `DATABASE_MIGRATION_URL` explicitly.

The release performs these steps before replacing the API/worker:

1. Verify that the host provides **pgvector** and enable `vector`. The committed
   initial migration already uses `vector`; client generation alone is insufficient.
2. Enable **TimescaleDB** when the host offers it. The extension's SQL name is
   `timescaledb`, not `timescale_db`. The server must already have its packages
   and `shared_preload_libraries` configured; app deployment cannot install them
   on a remote managed database.
3. Apply committed Prisma migrations and seed reference data.
4. Prepare the trending hypertable/analytics views and backfill existing posts
   in resumable batches of 100. The deployment logs progress, remembers the
   committed cursor, and skips this backfill after completion. New writes and
   edits are handled by database triggers, rather than replaying all history on
   every deployment.

`TIMESCALEDB_MODE` defaults to `auto`. Set it to `required` to stop deployment if
TimescaleDB is unavailable, or `off` to skip enabling it. In automatic mode, a host
without TimescaleDB uses the same indexed PostgreSQL event table and live views;
the public trending API continues to function. Permission/preload failures on
an available extension stop deployment with an actionable error.

Neon lists both pgvector and TimescaleDB, but provides **Apache-2 licensed
TimescaleDB features only**. Hypertables work; continuous aggregates require the
Timescale license. The setup detects the license and creates live PostgreSQL
views on Apache-only hosts instead. See [Neon's extension support](https://neon.com/docs/extensions/pg-extensions)
and [TimescaleDB on Neon](https://neon.com/docs/extensions/timescaledb).

On a full TimescaleDB installation, `PostTrendingEvent` becomes a one-day-chunk
hypertable. Versioned `kwonnet_trending_hourly_v1` and
`kwonnet_trending_daily_v1` continuous aggregates refresh automatically. Each
counts distinct posts/users directly from events: daily users are not a sum of
hourly users. The first release refreshes the last 30 days once; subsequent
releases preserve the views and policies. Recent unmaterialized events are
included through real-time aggregation. Existing manually created legacy views
are preserved; no `DROP ... CASCADE` is used.

For a **new** self-hosted database, the official
[`timescale/timescaledb-ha` image](https://github.com/timescale/timescaledb-docker-ha)
includes pgvector. Provision it with persistent storage, a private network and
strong credentials, then point the existing database URLs at it. Do not replace
an existing production database/container or attach its data directory to a
new PostgreSQL major version as part of deploying this app. Moving an existing
database requires a separate backup/restore cutover.

## Turning post content into n-grams

The committed migration installs the extraction functions and post triggers.
For example, `Solar Energy Revolution #Solar` produces unigrams such as `solar`,
bigrams such as `solar energy`, trigrams such as `solar energy revolution`, and
the hashtag `solar`. Hashtags keep their full word: the first letter is not removed.

- Draft.js content is parsed into its rendered block text; entity metadata,
  object keys, URLs, mentions, and HTML tags are excluded.
- Keywords are lowercased and deduplicated per post. Repeating a word or hashtag
  does not inflate its mention count. If a word is also a hashtag, `isHashtag`
  remains true. English stopwords are excluded without joining unrelated words
  across removed stopwords. Extraction is capped at 50,000 characters, with
  n-grams limited to the first 1,000 tokens and keywords at most 160 characters.
- Only published, visible, public root posts contribute. Drafts, deleted/hidden
  posts, restricted scopes, replies and reposts are excluded. Content/status/
  visibility/country changes replace the post's derived events atomically;
  deletion removes them. Like/view counter updates do not re-extract content.
- Global trends combine countries into one topic. Country queries bind the
  country ID as a parameter (ISO2 codes are resolved to IDs first). The public
  endpoint requires just one qualifying post in the last 24 hours, rather than
  ten, so a small community can show trends. Empty results return `200 []`.
  The API uses exact rolling 24-hour, previous-24-hour
  and 30-day counts, and checks current post/account visibility on every read.
  Private, suspended, deleted or deactivated authors cannot appear in trends,
  even when an analytics summary has not refreshed yet. Future timestamps are
  excluded. Distinct users are counted over the complete window.

Existing posts are indexed by the first deployment backfill, with their original
creation dates preserved. New posts and edits are indexed by triggers. A keyword
must occur in a qualifying post within the last 24 hours to appear as a current
trend; its displayed totals include qualifying posts from the last 30 days.
Backfilling does not make old posts look newly published. The web sidebar falls
back to global trends when a user's country has no qualifying topics.

The analytics views are internal reporting summaries. The public API deliberately
reads indexed events with live visibility checks; precomputed counts alone cannot
safely reflect an account becoming private. This is keyword-frequency trending,
not sentiment analysis, spam detection, or automatic vector embedding generation.
`vector` enables the existing vector columns; n-gram extraction does not invent
embeddings or alter their dimensions.

Useful commands after building:

```sh
npm run db:deploy      # normal automatic release, including analytics
npm run db:extensions # inspect/enable supported extensions only
npm run db:analytics  # idempotent analytics preparation/resume only
```

SQL inspection (same configured database):

```sql
SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector', 'timescaledb');
SELECT name, cursor, "completedAt" FROM "KwonnetAnalyticsSetup";
SELECT * FROM kwonnet_trend_keywords('Solar Energy Revolution #Solar');
SELECT * FROM kwonnet_trending_hourly_v1 ORDER BY bucket DESC LIMIT 20;
```

Public endpoint: `GET /api/v1/discover/trend` (see the registered discovery
routes for authentication and country filtering). No manual README SQL steps
are required on each deployment. Backfill failures roll back the current batch;
rerunning deployment resumes from the last successful batch.

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
| `npm run db:deploy` | Prepare extensions, apply committed migrations, seed reference data, and prepare/backfill analytics. Run once per release before starting new replicas. |
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

The database must support the `vector` extension used by the existing migrations. TimescaleDB is enabled according to `TIMESCALEDB_MODE` as described above. For Neon, use a direct connection for the release job if your pooled connection rejects migration or transaction operations. Do not use `migrate dev`, `db push`, or `migrate reset` as a production release step. Existing databases created without Prisma migration history need an intentional baseline before deploying migrations; do not reset them.

Docker generates Prisma Client for Linux during the build and includes the compiled seed, migration files, and Prisma CLI in the runtime image. Build the image, run a one-off release container, then deploy application replicas:

```sh
docker build -t kwonserver:release .
docker run --rm --env-file .env kwonserver:release npm run db:deploy
```

The GitHub Actions Compute Engine workflow performs that release command using the selected kwonserver image before replacing the API and worker. A failed migration or seed stops deployment. The `gcp-build` hook only builds; configure `npm run db:deploy` as the release step in other hosting pipelines as well. Application startup does not run migrations independently in every replica.

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

### BullMQ background jobs

All 11 former Bree handlers now live in `src/cron/recurring`. Redis persists
schedules in the `kwonserverBackgroundJobs` queue. Starting multiple workers
upserts the same scheduler IDs, and global concurrency is one for this queue.
Existing subscription, reminder and post-processing queues remain separate.

| Job | Schedule (UTC by default) |
| --- | --- |
| Transactions sync | Every 30 minutes |
| Wallet sync | Minute 0 and 45 of each hour |
| Weekly rewards | Monday at 00:00 |
| Monthly rewards | First day of the month at 02:00 |
| Monthly game statistics sync | First day of the month at 12:00 |
| Three annual reward jobs | January 2 at 12:00 |
| Subscription scheduling | Every 2 minutes |
| ClickHouse sync | Disabled; opt in with `ENABLE_CLICKHOUSE_SYNC=true` |
| Player monthly statistics sync | Manual only, as before |

Set `JOBS_TIMEZONE=Africa/Lagos` if schedules should use Nigerian local time.
Annual reward schedules now run in January only. Changing a schedule does not
backfill missed reward periods.

For production Compute Engine hosting, use the automatic GitHub Actions
[deployment guide](deploy/compute/README.md). The workflow deploys a separate
BullMQ worker with the API; no manual worker Compose command is needed.

For local development, `npm run dev` starts the API and workers together by
default. Alternatively use `RUN_BACKGROUND_JOBS=false npm run dev` and
`RUN_BACKGROUND_JOBS=true npm run dev:worker` in separate terminals. Disable
background processing on developer machines connected to production Redis.

Use persistent Redis with a `noeviction` policy. Job completion and failure are
logged, and the latest 1,000 completed and failed recurring jobs are retained.
Recurring jobs get one attempt; stalled jobs fail instead of automatically
replaying payouts. BullMQ does not make the existing financial operations
exactly-once: inspect partial database/wallet updates before manually retrying a
failed reward job. Existing event-driven queues retain their retry policies.
SIGTERM/SIGINT allow up to 30 seconds for graceful shutdown.

When upgrading, stop any old Bree processes first. The subscription renewal
queue name has also been corrected: existing renewal jobs accidentally written
to the reminder queue are not automatically moved or charged. Review and
reschedule affected subscriptions before retiring those old jobs. No database
schema migration is required for the BullMQ conversion itself.

### Automatic Compute Engine deployment (kwonserver only)

See [the GitHub Actions setup guide](deploy/compute/README.md) for the active
server-only push-to-deploy workflow. It keeps kwonweb and kwonrec on their
existing hosts, deploys the API and BullMQ worker together, and uses GitHub
environment secrets plus Google Workload Identity Federation.

### Newsfeed tabs

The routes/controllers/services for posts are maintained in their existing
`index.ts` files. `/api/v1/posts/feed/:feedType` binds the viewer to the
authenticated account; client-supplied viewer IDs never select another account's
relationships. `foryou` hydrates recommender-ranked IDs. `following` reads authors
with an accepted follow from the viewer. `friends` requires accepted follows in
both directions. `latest` reads visible public posts newest first. `trending`
orders visible public posts from the last 72 hours by likes, replies, reposts,
shares, and date. Non-recommendation tabs query PostgreSQL directly and paginate
there, without requiring kwonrec. Privacy, block/mute, report, scheduling, and
quoted/reposted parent visibility checks remain enforced by the API.

### Discover country and semantic category trends

`GET /api/v1/discover/trend?mode=foryou&limit=50` resolves the authenticated
account's country from PostgreSQL. An empty country result falls back to worldwide
trends; guests and accounts without a country use worldwide directly. A database
error is reported rather than disguised as empty results. Ordinary country filters
remain available for Worldwide. New posts capture the author's country when no
country is assigned; older events without one use the author's current country.

`topic=sports`, `topic=music`, etc. filters the same real keyword/hashtag counts
by the post's inferred category. `arts-culture` in the UI maps to `arts & culture`.
These categories do not manufacture trends: results still require public, visible,
published root posts in the last 24 hours, with exact unique-post/author counts.
The existing PostgreSQL/Timescale extraction indexes words, n-grams and hashtags;
semantic inference assigns `Post.topic` and does not replace that extraction.

The existing BullMQ topic queue now receives new posts after commit. The worker
uses the existing [Transformers.js zero-shot classifier](https://huggingface.co/docs/transformers.js/api/pipelines#module_pipelines.ZeroShotClassificationPipeline)
with quantized BART MNLI locally, with
one job globally at a time; content is not sent to a third-party inference API.
The old kwonrec `/classify` compatibility endpoint only matched literal label
words and is no longer used for post categorization. Inference reads rendered
text, excludes Draft.js metadata, caps input at 2,000 characters and stores
`generic` for tiny text or a top score below 0.35. A model score is a heuristic,
not guaranteed semantic accuracy, particularly for non-English content; validate
category quality with representative posts before tuning this cutoff.

Jobs use content hashes, four exponential retries, bounded retained failures and
an hourly retry cooldown for exhausted jobs. A minute-by-minute reconciliation
job scans 50 pending posts per page, prioritizes new posts over historical
backfill and pauses at 500 queued/in-flight jobs. It recovers missed enqueues or
Redis loss using pending database rows. Deleted/unpublished posts and obsolete
content versions are ignored; conditional writes prevent late inference from
replacing an edited post. The normal deployment migration clears old lexical
labels for semantic backfill and adds a trigger resetting topics after text edits.
Existing posts are processed gradually, without delaying post creation or reads.

Compute deployment persists the model cache in `kwonserver_model_cache`, mounted
only in the worker with `TRANSFORMERS_CACHE=/app/model-cache`. Other hosts should
provide a writable persistent cache using that setting. First inference downloads
the model from Hugging Face; subsequent jobs/releases reuse it. Monitor worker
memory, `postTopicQueue` backlog/failures and pending `Post.topic IS NULL` rows.
Deploy kwonserver before kwonweb. Category pages can be empty until classification
has caught up; that is displayed as an empty state rather than a placeholder.

### Trend and hashtag search

Trend links use `/search?q=...&src=trend_click&vertical=trends&tab=top`;
post hashtags use the same page with `src=hashtag_click` and a `#` query.
The web page supports Top, Latest and People tabs, server-rendered first results,
identity-scoped SWR pagination and the existing feed interactions.

`GET /api/v1/posts/search?q=...&tab=top|latest&page=1&limit=21` returns
`{ posts, hasMore }`. Public posts are searched against rendered Draft.js/plain
text with PostgreSQL full-text search; all query words must match. Top orders by
likes, replies and reposts before recency; Latest orders by recency. Hashtag
queries match the exact indexed hashtag, excluding longer tags and plain text.
Drafts, hidden/deleted/private/restricted/future posts are excluded. Authenticated
search also applies block/mute/report/disinterest rules and hydrates viewer
reaction flags from the existing feed service. Anonymous responses use the small
public post DTO. People uses the existing paginated `/users/search` endpoint with
public profile fields only and authenticated block/mute filtering.

The normal migration deployment adds `Post_public_search_idx`, a GIN index over
the existing rendered-text extractor; it indexes existing content as well as new
posts without an external search service or extra database extension. Deploy
kwonserver and its migrations before kwonweb. Search is keyword matching rather
than semantic similarity; Media and Lists tabs are outside this implementation.

After a successful profile save, the web editor explicitly triggers the Auth.js
update callback to refetch identity from the authenticated backend. Cached public
identity fields and linked-account metadata are refreshed without accepting
client-provided session identity or requiring another login.

### Read caching and profile performance

Countries/continents use the existing shared Redis cache for one hour. Coin packages
and subscription catalogs use a one-minute cache; purchase operations continue to
validate prices from the database. Concurrent catalog misses share one SQL read,
and Redis read failures or waits over 200 ms fall back to SQL. Failed service
responses are not cached. This reuses the process's existing cache connection.

Profile feeds remain viewer-specific and freshly authorized rather than globally
cached. Their first page streams from the web server, subsequent pages/tabs use
viewer-scoped SWR caches, and database pagination uses a stable ID tie-breaker.
Migration `20261005050000_profile_feed_index` adds the author/status/date index via
the existing deployment migration process. Profile overview counts and mutual
connections load concurrently. Empty pages skip the repost-status query.
