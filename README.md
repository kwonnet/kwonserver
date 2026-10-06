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
with quantized `MoritzLaurer/deberta-v3-large-zeroshot-v1.1-all-33` locally, with
one job globally at a time; content is not sent to a third-party inference API.
The old kwonrec `/classify` compatibility endpoint only matched literal label
words and is no longer used for post categorization. Inference reads rendered
text, excludes Draft.js metadata, caps input at 2,000 characters and stores
`generic` for text shorter than 10 characters or a top independent relevance score
below 0.5. Categories are scored independently (`multi_label: true`), and only
the strongest accepted category is saved. This avoids diluting confidence across
overlapping labels such as news, politics and community. A model score is a heuristic,
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
Migration `20261005140000_reassess_generic_post_topics` resets existing published
and scheduled generic topics to pending once so the corrected scoring can reassess
them. Run the normal deployment migration and restart the worker; the existing
bounded reconciliation job handles the backfill. Existing posts are processed
gradually, without delaying post creation or reads.

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

### Google identity and owner-only gift reporting

Google authentication uses `POST /api/v1/auth/google` with a Google `idToken`.
Set `AUTH_GOOGLE_ID` to the web application's OAuth client ID. The Google SDK
verifies signature, issuer, expiry and audience; verified email is required.
Accounts bind to the stable Google subject. Existing Gmail/Workspace addresses
can link to their matching account; existing third-party email accounts require
password sign-in instead of automatic linking. Inactive/deleted accounts cannot
sign in. New accounts reuse transactional wallet/registration-bonus creation.

Migration `20261005060000_google_and_post_gifters` adds the unique Google subject,
an immutable coin-value field on new tips, and an index for post gift pagination.
It runs in the existing deployment migration process.

`GET /api/v1/posts/:id/engagements` reports whether the authenticated viewer owns the
post. `GET /api/v1/posts/:id/gifters?page=1&limit=21` independently enforces ownership,
returns stable gift pagination and totals from a repeatable-read snapshot, redacts
anonymous identities, and excludes refunded/expired gifts. Results use
`private, no-store`. Amounts are gross tip values in coins, not net TZX settlement.
Legacy tips have no historical coin snapshot; their current package price is used
only as an explicitly flagged estimate. New tips capture the package price inside
the existing wallet transaction. Reporting never changes balances or settlements.

### Login security history and revocable sessions

Migration `20261005100000_login_security` is additive. It creates `AuthIdentity`,
`UserSession`, and `LoginEvent`, with owner/date/expiry/retention indexes. It
backfills PASSWORD identities from existing non-empty password hashes and GOOGLE
identities from existing `googleSubject` values. Those User fields remain in place:
no passwords, Google links, user IDs, wallets, or balances are replaced.

Successful password signup/signin and Google signin issue encrypted API tokens
containing a server session ID. The corresponding session and successful-login
event are committed together. Failed authentication/signing/tracking does not
return a usable new token. Refresh reuses the session and updates last activity
with writes throttled to once per minute; it does not create another login event.
Saved-account switches create a new session using the stored session's provider.
Untracked pre-upgrade tokens keep their existing 24-hour maximum expiry and become
LEGACY-attributed sessions on their next refresh. Their historical provider is
not guessed; pre-upgrade tokens cannot be individually revoked until upgraded.

Device/browser/OS are parsed from the user agent; raw agents, credentials, passwords,
and OAuth/API tokens are not stored in telemetry. Location is an allowlisted JSON
object from the existing optional IP lookup (country/region/city/timezone), never
GPS coordinates, postal addresses, or the raw lookup payload. Lookup failure leaves
location null. IPs are normalized and stored as IPv4 /24 or IPv6 /48 network prefixes.
An optional independent `AUTH_IP_HASH_SECRET` (32+ chars) supplies a keyed IP hash;
API history responses do not expose that hash or provider account identifiers.

Express no longer trusts all proxies. `AUTH_TRUST_PROXY_IPS` controls trusted CIDRs
(default `loopback,uniquelocal`; narrow it for production). Do not trust arbitrary
internet clients or enable blanket trust. Socket peer/Express trust-chain metadata
is used; arbitrary forwarding headers and client-posted locations are ignored.
See [Express proxy trust](https://expressjs.com/en/guide/behind-proxies.html).

NextAuth calls the API from the web server. Set the same new independent
`AUTH_TELEMETRY_SHARED_SECRET` (32+ chars) in both runtimes to forward signed browser
metadata. Signatures are checked with constant-time comparison and a 60-second
clock window. Configure the web-only `AUTH_TRUSTED_WEB_IP_HEADER` ONLY when ingress
overwrites that single-address header and direct origin bypass is restricted.
Default web IP/location is unknown rather than trusting arbitrary X-Forwarded-For.
Without the bridge, API_REQUEST metadata describes the API caller (possibly the
web server), not necessarily the end user's browser. Device claims are user-agent
observations, not proof of device identity and are never authorization factors.

Owner-scoped endpoints (all private/no-store):

- `GET /api/v1/auth/sessions?page=1`: active sessions, current-session flag, parsed
  device, coarse location, masked IP, creation/last-activity/expiry timestamps.
- `GET /api/v1/auth/login-events?page=1`: successful authentication audit history.
- `DELETE /api/v1/auth/sessions/:id`: revoke an owned session (204; missing/foreign 404).
- `GET /api/v1/auth/session-status`: lightweight authenticated session validation.

API authorization/refresh and socket handshakes reject revoked/expired sessions.
Socket packets recheck revocation; current-process sockets disconnect on revocation,
and idle sockets/SSE streams recheck within 30 seconds on other replicas. No new
Redis clients are introduced. Already-authorized in-flight operations may finish.
SSE now requires authentication and web clients connect through `/api/events`,
which puts the API token in the server Authorization header, not a URL.

Logout revokes the active session; an expired but validly signed access token can
identify only that logout target, never authorize access or refresh. API cookies
are still cleared if storage is down; a 503 signals failed server revocation.
The web logout response reports `serverRevoked:false` on failure while still clearing
local cookies. Local logout remains usable offline, but remote revocation cannot
be guaranteed while the API/database is unavailable. Database authorization checks
fail closed. Revocation does not automatically log out the owner's other sessions.

Sessions expire after 30 days. Telemetry is marked with 90-day `retainUntil`
timestamps. Run `npm run auth:cleanup` from the built API runtime (or
`docker exec kwonserver npm run auth:cleanup`) on a daily maintenance schedule to
purge old events and expired/revoked sessions. Cleanup never deletes active
sessions or user/identity/wallet records. This command is supplied; scheduling it
on the host is an operator deployment step, not an automatically installed cron.

Deploy backend migrations/API before the web changes, then configure the bridge
and proxy trust. Live ingress/header trust and secret distribution must be checked
in the deployment environment; local tests cannot prove production topology.

### Diagnosing missing IP locations

An IP is an input to a geolocation database, not an encoded city/country. IPv6 is
supported by the installed library. A masked `ipAddress` prefix in telemetry is
only the stored privacy-safe representation; lookup uses the full transient IP.

The API warms its existing `ip-location-api` database in the background at startup.
Authentication retains the 1.5-second maximum optional lookup wait so database
creation/download does not delay sign-in indefinitely. Failed initialization now
retries after a one-minute cooldown on the next lookup. Default fields are country,
region name, city and timezone (an explicit `ILA_FIELDS` setting overrides this).
No additional external geolocation service is used.

Logs distinguish `IP geolocation database ready` from initialization failure.
`Authentication location unavailable` reports state, failure count, retry time and
the last lookup outcome (`timeout`, `no_match`, `lookup_failed`). Recognized filesystem
and network error codes are reported without raw messages, full IPs, agents or
credentials. Outcomes are process-level diagnostic snapshots during concurrent
requests. A ready database can still lack a particular address range; it does not
guarantee a city-level result. Existing login history snapshots are not retroactively
modified. After database readiness, a new successful login captures any available
coarse location. The SDK's data directory must be writable and its configured
GeoLite/IP database download source reachable from the container.

### Registration country inference

Password signup passes the trusted request's sanitized IP-lookup JSON to
`createUser`. New Google registration now does the same after Google verification,
reusing one lookup snapshot for account creation and authentication history.
`createUser` resolves non-empty, trimmed lookup country identifiers/names against
the existing Country catalog (case-insensitive ISO2, ISO3 or name), connects
`User.countryId` within the registration transaction, and returns the included
country in the normal authentication user response. A lookup miss or missing
catalog match leaves country null rather than inventing a default. Google signin
or email linking for existing accounts never overwrites a chosen country. Existing
users are not backfilled by this change; they can use the profile country editor.
No new schema migration is needed for this registration fix.


### Push notification delivery and scheduled posts

Deploy migration `20261005150000_push_delivery` before restarting the API and worker.
It deduplicates browser endpoints, associates new subscriptions with login sessions,
and adds durable push-delivery bookkeeping. Historical notifications are marked
processed so rollout does not notify users about old activity. Set `VAPID_EMAIL`
(a `mailto:` contact), `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` on kwonserver;
kwonweb's `NEXT_PUBLIC_VAPID_PUBLIC_KEY` must match the public key. Never expose the
private key. Push requires HTTPS and browser permission granted from Settings.
Expired push endpoints (404/410) are removed. Delivery scans new committed in-app
notifications every minute, retries transient failures up to five attempts, and
uses notification IDs as browser tags to replace duplicate deliveries after retries.
Monitor unsent `Notification` rows with `pushAttempts = 5` for configuration or
provider problems. Session-bound subscriptions are excluded after revocation or
expiry; old subscriptions without a session are rebound when the user next visits.

`publish_scheduled_posts` runs every minute in the existing background worker.
It locks bounded batches of due scheduled posts and publishes atomically; future,
draft, deleted and disabled-author posts are not published. Poll/quiz expiry starts
from the chosen schedule. New scheduled reply/quote engagement effects occur at
publication; older scheduled posts retain their already-applied counts. UTC dates
with explicit offsets are required, at least five minutes in the future. Publication
may be up to one scheduler interval later, or longer under worker backlog/outage;
overdue posts are picked up when the worker resumes. Keep background jobs enabled.


### Account credentials and SEO preview APIs

Settings reads `GET /api/v1/auth/settings` (username and hasPassword only) and updates
passwords through `PATCH /api/v1/auth/password`. Existing password accounts must
verify the current password. Google-only accounts may set their first password
only from a Google session created within the last five minutes. New passwords use
the existing 8–32 character policy and enforce bcrypt's 72-byte UTF-8 limit. Hashes
are stored using bcrypt; responses and logs never include credentials. Password
changes preserve the current tracked session, revoke other tracked sessions and
invalidate historical sessionless tokens. Deploy migration
`20261005170000_password_change_revocation` before restarting the API. Existing
accounts retain historical token compatibility until they change their password.
Username edits reuse the existing profile endpoint, normalize to lowercase and
serialize competing claims with an advisory lock; IDs and account data stay intact.

Public SEO endpoints are `/users/:id/metadata`, `/posts/:id/metadata` and
`/posts/metadata-index`. They expose only active public profiles and visible public
root posts, never private identity/contact data or viewer relationships. The sitemap
index is capped at the newest 1,000 posts from the past 30 days. Anonymous embeds
apply the same visibility gate and never include another user's reaction state.


### DeBERTa post topic classification

The post worker now runs the requested [DeBERTa model](https://huggingface.co/MoritzLaurer/deberta-v3-large-zeroshot-v1.1-all-33)
through its published ONNX q8 weights using the existing Transformers.js dependency.
Weights and tokenizer are pinned to revision `c5dca3bda16d30337e493e3e3e5caa19a3e7c8c2`.
The hypothesis is `This example is about {}`; the existing 17 category labels,
independent relevance scoring (`multi_label: true`), top-label selection and 0.5
minimum remain unchanged. Scores are not calibrated probabilities. The model was
trained on English; assess non-English/Pidgin posts separately before claiming quality.

Deploy migration `20261005190000_post_topic_model_version` before restarting the
API/worker. It adds `Post.topicModel` and a sparse recovery index for this revision.
The existing recovery job scans old/null model versions in batches of 50, preserves
current labels during the backlog, and stamps successful processing with the new
model version. Failure leaves the previous label/version intact for retry. Content
hashes still prevent stale edits being overwritten; job IDs now include the model
version so old failures cannot block the replacement classifier. Changing the model
revision later should also refresh the recovery index predicate in a migration.

Model loading remains lazy in the background worker. Existing deployment cache
volume/settings are reused. The first download is approximately 643 MB; allow RAM
headroom for both Node workers and kwonrec on the shared VM. On the development
machine the quantized model used roughly 1.3 GB RSS after evaluation; six short posts
ran in approximately 0.55–0.80 seconds each with two CPU threads and one global job.
Those figures are not a VM capacity benchmark. The example about AI art ranked
technology (0.9981) above learning (0.9821). All six public smoke examples matched
intended categories; this is not an accuracy claim over the production corpus.

To reproduce without reading application credentials, database rows or Redis:
`npm run compile` then `npm run topics:evaluate`. Set `TRANSFORMERS_CACHE` to a
writable persistent directory to reuse weights. The default local `.model-cache`
is git-ignored. Run evaluation where RAM is available for an additional model
instance, rather than duplicating inference blindly on a busy production worker.

## Engagement rewards, community boosts and welcome-email delivery

These features extend the existing routes → controllers → services architecture.
Task API queries and claims live in `src/services/v1/tasks/index.ts`; feed promotion
and impression accounting live in the existing posts module. All coin credits use
`walletOperation`, the locked PostgreSQL wallet, and the immutable transaction ledger.
Redis is a candidate cache/queue transport, not the authority for rewards or reach.

### Deployment and configuration

Apply `20261006000000_engagement_boost_email` before restarting the API and worker.
The normal `npm run db:deploy` deployment stage already applies it. It adds task
configuration/claim/anti-replay tables, boost delivery/view records, a registration
email outbox, and a baseline reach setting on subscription plans. Existing wallets,
legacy tasks and registration bonuses are preserved. Only eligible posts created
within the last 24 hours are backfilled into boosts. Existing users do not receive
retroactive welcome emails.

Keep the worker enabled (`RUN_BACKGROUND_JOBS=true` in the worker; false in the API).
There are now 16 recurring schedules by default, 17 with ClickHouse sync enabled,
plus the existing specialized queues and the new email queue. Daily task rewards
rotate at **00:00 UTC**, regardless of `JOBS_TIMEZONE`; email recovery runs every
minute. API task reads/claims also repair missed daily rotations under a distributed
PostgreSQL advisory lock. Restarting replicas does not reroll an already-rotated day.

For email, add these entries to the existing **KWONSERVER_ENV GitHub environment
secret** (and local `.env` when developing):

| Variable | Purpose |
| --- | --- |
| `SMTP_HOST` | SMTP provider hostname |
| `SMTP_PORT` | Usually 587 for STARTTLS or 465 for TLS |
| `SMTP_SECURE` | `true` for implicit TLS, otherwise `false` with required STARTTLS |
| `SMTP_USER` | SMTP login |
| `SMTP_PASSWORD` | SMTP credential; keep in secrets |
| `SMTP_FROM` | Provider-verified sender email address, without a display name |
| `WEB_APP_URL` | Public HTTPS origin, default `https://kwonnet.com` |

The existing deployment copies KWONSERVER_ENV to both containers. No additional
Redis instance or SMTP credential in kwonweb is needed. Docker now includes the
`templates` directory. Configure your provider's sender/domain verification and
SPF/DKIM/DMARC for inbox delivery; SMTP acceptance alone does not prove delivery to
the inbox. Actual provider sending needs a configured SMTP account; automated tests
use a capture transport and never send to real recipients.

### Daily engagement tasks

The new authenticated `/tasks` web page shows live progress, the day's reward,
eligibility, disabled state, and a countdown to the next claim. The check button
**checks and claims** when eligible; incomplete checks explain how many qualifying
actions remain. Rewards are random integers from **5 to 15 bonus coins per task per
UTC day**. They are credited to `Wallet.bonus`, not cash/credit. A daily rotation does
not reset the user's claim cooldown: each task unlocks **24 hours after that user's
successful claim**. The response's reward is authoritative if midnight occurs while
the page is open. Bonuses may legitimately repeat across days by random chance.
Existing daily rewards below five are regenerated on the next task read or claim;
already claimed rewards are preserved.

| Task | Default goal | Verified targets |
| --- | ---: | --- |
| Like | 20 | Different other-author public posts with a current like |
| Comment | 20 | Different other-author public parent posts with a published reply |
| Repost | 10 | Different other-author public originals with a published repost |
| Quote | 5 | Different other-author public originals with a published quote |
| Follow | 5 | Different active accounts with accepted follows |
| Gain followers | 3 | Different active accepted followers |
| Bookmark | 10 | Different other-author public posts with a current bookmark |
| Publish | 2 | Own published, public, visible root posts |
| Receive likes | 10 | Different active people liking own public posts |
| Receive comments | 5 | Different active people commenting on own public posts |

Progress uses server-stored timestamps in the last 24 hours, starting no earlier
than the previous claim. Follow tasks use acceptance/update time, not a client date.
Draft/scheduled/unpublished, hidden/deleted and self-engagement records are excluded.
Repeated comments on one parent count once; repeated likes from one person count
once for incoming tasks. Once a target has funded a reward for that user/task it
cannot fund another reward, even after the cooldown (stored in EngagementCredit).
This deliberately prevents undo/recreate farming; recurring completion requires new
qualifying targets. Unique account IDs do not prove unique humans. Collusion/Sybil
abuse still needs moderation and operational monitoring; do not interpret these
checks as fraud-proof identity verification. Negative actions, arbitrary external
share clicks and spending/tipping loops are not rewarded.

API contract (bearer authentication, current user inferred from the verified token):

| Method and path | Behavior |
| --- | --- |
| `GET /api/v1/tasks/engagement` | Own progress/cooldowns; no shared cache |
| `POST /api/v1/tasks/engagement/:id/claim` | Check and atomically credit; requires `Idempotency-Key` |
| `PATCH /api/v1/tasks/engagement/:id` | ADMIN/SUPER only; `{enabled?: boolean, target?: integer}` |

Task IDs are `like`, `comment`, `repost`, `quote`, `follow`, `followers`, `bookmark`,
`publish`, `likes-received` and `comments-received`. Admins can change the required
count (1–1000) or disable a task in the same Tasks page. They cannot supply a reward
from the browser; the scheduler/DB cap controls it. Legacy task creation is now also
administrator-only to close a pre-existing self-issued reward path.

A missing/disabled task returns 404; an active cooldown returns 409; insufficient
progress returns 422 with a progress message. A locked wallet cannot receive the
claim. The frontend keeps the request key across uncertain network failures and
clears it after a confirmed outcome. Replaying a successful key returns the receipt
without minting more coins; a different key inside the same cooldown still cannot
pay. Claim history, used-target credits, wallet balance and APP_TASK ledger entry
commit together. Wallet caches refresh after confirmed credit.

### Community amplification

A PostgreSQL publication trigger queues **public, visible original root posts** from
active public authors. Drafts, restricted posts, private authors, hidden/deleted
posts and replies/reposts are not promoted. Scheduled originals enter when the
publisher transitions them to PUBLISHED. Each boost has an immutable 24-hour window
and a stored target; edits do not restart an expired window. Initial backfill covers
only the remaining portion of eligible recent posts' first 24 hours.

Each authenticated load of For You, Following, Friends, Trending or Latest may insert
**up to four** random eligible community slots. These are marked "Community boost".
Following/Friends organic selection stays intact; community slots are explicitly
outside its following relationship filter. Organic rows are preserved, so a page
can contain the requested organic limit plus four slots; there is no offset gap from
trimming organic rows. Search/profile feeds and the unauthenticated public preview
are not promotion insertion surfaces in this version.

Redis caches up to 128 candidate IDs for 15 seconds. Selection prefers lower
completed fractions and randomizes within the candidate pool. PostgreSQL rechecks
publication/author visibility, block/mute/report/disinterest rules and current
eligibility before selection and after hydration. Own posts are excluded. A unique
post/viewer reservation prevents concurrent feeds or different feed tabs from
inserting the same boost twice. Failed/unhydrated reservations can be retried after
a two-minute lease; delivered community slots remain suppressed for that viewer.
An organic appearance is allowed even after a boosted appearance.

**No impression is invented on queueing or delivery.** The viewport tracker requires
at least 50% visibility for one second while the document is visible. It sends an
authenticated keepalive request using an Authorization header, never a token in the
URL. Qualifying acknowledgements from signed-in non-owners advance the boost count;
server time and a 150-second per-viewer/post cooldown prevent refresh bursts from
inflating it. Organic repeat impressions beyond the cooldown may count toward the
goal. Replays, owners, expired windows and currently-ineligible posts do not advance
reach. Client visibility signals are not a cryptographic proof of human attention;
bot checks, cooldowns and authenticated identities reduce simple inflation.

150 is a **traffic-dependent target**, not a guaranteed number. Enough eligible
users, feed loads and actual viewport views must exist to serve every post's demand.
The system reports an expired shortfall instead of extending the window or counting
synthetic views. Post-owner Analytics displays qualified progress and deadline;
`GET /api/v1/posts/:id/boost` is owner-only. Delivery records and PostBoostView markers
are durable across Redis loss. If the promotion subsystem fails, organic feed data
still returns. Cache IDs are never an authorization decision.

`SubscriptionPlan.postBoostTarget` defaults to 150 and accepts 150–10000. Publication
captures the highest eligible ACTIVE/TRIAL primary plan target into the new boost.
This prepares tier-specific reach without changing billing/tiers in this release.
A later plan change affects future posts, not existing windows. Higher targets still
require audience capacity; setting a number is not an audience-delivery guarantee.

### Registration welcome email

`createUser` writes one `EmailMessage` event (`welcome:<userId>`) in the same database
transaction as the user, wallet and registration bonus. Both password registration
and a genuinely new Google account use that service. An existing Google link/login
or duplicate signup never creates another welcome event. A rolled-back registration
cannot leave an email to a nonexistent account. Registration does not wait on Redis,
template compilation or SMTP.

Every minute the recovery job publishes due outbox IDs to `emailDeliveryQueue`.
Redis job data contains the outbox ID only, not email addresses, content or secrets.
The dedicated worker has global concurrency two and a leased database claim. It
renders `templates/email/welcome.mjml`, greets the user, introduces **Kelvin Torver
Peter as Founder and CEO**, explains platform features and encourages continued
content creation. It includes a responsive HTML design, plain-text alternative,
one creation CTA and public legal links. Names are escaped; links use the configured
HTTPS origin; filesystem/URL mail attachments are disabled. SMTP always uses TLS
and credentials remain server-side.

Normal success is marked SENT only after SMTP acceptance. Disabled/deleted accounts
are cancelled. Missing configuration remains pending every five minutes without
consuming send attempts. Transient failures retry with exponential backoff; five
failed attempts become FAILED for operator review. Error storage contains sanitized
codes only, never the provider's credential-bearing message. Stable Message-ID and
unique events stop ordinary duplicate queueing. SMTP cannot guarantee exactly-once
sending across a crash after provider acceptance but before the SENT database write;
a retry in that narrow window can produce a duplicate depending on the provider.

Monitor EmailMessage status/attempts/lastErrorCode and BullMQ failed jobs. After fixing
configuration or a provider error, requeue a specific reviewed failed message:
`UPDATE "EmailMessage" SET status='PENDING', attempts=0, "leaseUntil"=NULL,
"nextAttemptAt"=CURRENT_TIMESTAMP WHERE id='<outbox-id>' AND status='FAILED';`
Do not reset SENT rows. Email jobs continue after Redis recovery from the durable
outbox. Templates are compiled locally; user content is not sent to an email-template
service.

### Verification

Regression coverage includes parallel/replayed wallet claims, cooldown boundaries,
disabled tasks, action target exclusions and ledger consistency; boost reservations,
visibility, owners, repeat/cooldown accounting and expiry; and first-registration
outbox uniqueness, template escaping, TLS, missing configuration, SMTP failures,
leases and recovery. Tests use disposable infrastructure or capture transports.
Validate SMTP inbox delivery and realistic audience capacity after configuring the
deployed environment; unit counts alone are not a delivery/capacity benchmark.

### Available newsfeed snapshots over SSE

Authenticated home tabs (`foryou`, `following`, `friends`, `trending`, `latest`)
expose `GET /v1/posts/feed/:feedType/available/stream?since=<ISO date>`.
The stream checks every three minutes while the browser page is visible. For You
waits three minutes before its first check; other tabs also perform an initial
check. The stream sends a heartbeat at 15 seconds, and renews the connection after 55 minutes. The existing auth stream
guard closes revoked sessions. Disconnects release timers; queries do not overlap
and responses respect stream backpressure. No global broadcaster or worker-local
state is needed, so scheduled publication and multiple API replicas are supported.

`feed_available` events contain `{feed, ids, authors}`, at most 50 IDs, ordered by
personalized rank for For You and newest first for other tabs. Each author preview contains only post ID, user ID, display name and avatar;
the floating button stacks up to three distinct profiles from pending posts.
Queries use the same authoritative tab visibility filters as ordinary feeds:
Following/Friends retain accepted relationship requirements; blocks, mutes,
reports, hidden/deleted posts, future schedules and private scopes are excluded as
appropriate. The bounded freshness window includes creation, due scheduled posts,
and the existing public-root publication/boost start marker for chronological tabs.
For You calls the existing personalized recommender with the authenticated user ID,
then removes recommendations already delivered to that user. Redis keeps a bounded
sorted history of the last 2,000 delivered organic recommendations per user, with
24-hour expiry, updated on normal feed loads and successful snapshot hydration.
It never marks merely announced/unclaimed posts delivered. The browser's `known`
parameter supplies up to 200 currently seen IDs as a supplementary baseline.
New recommendations can include older relevant posts, so For You uses rank/history
rather than a generic creation-time cutoff. Database visibility is checked before
sending IDs/profile previews. If the recommender returns degraded chronological
fallback, no For You event is sent; existing pending posts remain available.
For You availability checks share a Redis-backed snapshot across tabs/devices and
API replicas. `feed:availability:{userId}:lease` uses atomic `SET NX PX` with a
15-second recovery lease. Only its owner calls the recommender; concurrent callers
wait up to two seconds for the shared snapshot or defer their notification. A Lua
compare-and-publish operation stores the raw ranked IDs for the remainder of the
three-minute window and releases the lease. Ownership-token checks prevent expired
owners from overwriting a newer owner or deleting its lease. Ranking failures are
cached as unavailable for the same window to avoid retry stampedes.

Each connection independently removes its own baseline and the current delivered
history, then rechecks database visibility and builds fresh author previews. One
tab's baseline cannot hide candidates from another tab's shared ranking. The shared
snapshot does not mark posts delivered or award coins/impressions. Closing/logout
removes connection timers; Redis entries simply expire and no background queue is
created. The cache may remain briefly for other authenticated sessions on the same
account. If Redis coordination is unavailable, optional For You notifications pause
rather than start duplicate inference; ordinary feed loads continue normally.
Trending retains its existing three-day visibility window.

The browser keeps posts pending and does not modify the feed until the user clicks
“new posts available”. `GET /v1/posts/feed/:feedType/available?ids=id1,id2` validates
up to 50 IDs and hydrates exactly that requested snapshot through the existing
newsfeed query. It **rechecks visibility and tab membership at click time**. A
supplied viewer/user ID never determines the actor. Both endpoints require auth and
use private/no-store responses. A feed load or notification never counts as an
impression or reserves community boost delivery.

Next.js proxies the stream through the existing `/api/events?feed=...&since=...`
route using the server session's bearer header, so URLs contain no credentials.
The server-rendered page supplies the initial timestamp to cover the gap before
hydration. EventSource automatically reconnects against that same window (capped
at the last 24 hours). Loaded/consumed IDs are suppressed locally; a failed click
keeps the pending button available for retry. The freshest 50-post snapshot is
bounded rather than an unlimited offline inbox. Ordinary pagination remains the
way to read older posts. Guest preview, profile feeds and search do not open this
additional authenticated stream.

Operationally, allow long-lived unbuffered HTTP responses in the reverse proxy.
Each visible home tab adds one stream and a bounded check per three minutes,
alongside the existing interaction stream. For You additionally calls the existing
recommender; other tabs query the database. Hidden pages close this extra stream
and reopen it when visible, carrying their latest delivered baseline. Monitor connection and
query volume before substantially reducing this interval. No new environment
variables or database migrations are required beyond the existing boost migration.
