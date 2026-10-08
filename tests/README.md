# Backend testing

The backend now has unit tests, real-database integration tests, and focused
HTTP end-to-end flows. This does not claim full backend coverage.

Unit tests execute production TypeScript with mocked database, Redis and
external-provider boundaries. They require no running services. Controller
unit tests use request/response fixtures and are not HTTP tests.

Infrastructure tests use disposable PostgreSQL (with pgvector), Redis and
PostgreSQL containers. HTTP flows use real Express routes, controllers, JWT/AES
authentication, password hashing and databases; external geolocation is stubbed.
They do not start production workers or contact production services.

## Run locally

Use Node 22.23.3 or a compatible newer Node release, from `kwonserver`:

```sh
npm ci --ignore-scripts
npm run db:generate
npm test
npm run test:unit:coverage
npm run test:typecheck
```

`db:generate` generates the Prisma client without migrating, seeding, or querying
a database. If generation requests a URL, use a dummy value such as
`postgresql://unit:unit@127.0.0.1:1/unit`. Never run `db:deploy` to prepare unit tests.

Commands:

| Command | Purpose |
| --- | --- |
| `npm test` | Unit suite plus the existing regression scripts |
| `npm run test:unit` | Vitest unit suite only |
| `npm run test:unit:watch` | Re-run affected tests while editing |
| `npm run test:unit -- tests/unit/kwonrec.test.ts` | Run one unit suite |
| `npm run test:unit:coverage` | Coverage report and regression thresholds |
| `npm run test:typecheck` | Check production and test TypeScript |
| `npm run test:regression` | Existing seed, retired-provider and path-alias tests |
| `npm run test:integration` | Start isolated databases, apply migrations, run integration tests, clean up |
| `npm run test:e2e` | Start isolated databases and run focused HTTP lifecycle tests |
| `npm run test:infrastructure` | Run integration and HTTP suites together with one database startup |
| `npm run test:all` | Typecheck, unit coverage, regressions, migrations, integration and HTTP tests |

Open `coverage/unit/index.html` for the browsable report. JSON summary and LCOV
files are also generated there. Reports are ignored by Git and uploaded as
GitHub Actions artifacts. The workflow runs on pushes and pull requests.

## Coverage and scope

Verified baseline: **757 unit cases across 30 suites**, **11 existing regression
cases**, and **21 infrastructure cases across 8 suites** (14 integration and
7 HTTP cases). Full-source unit coverage is **34.90% lines, 34.29% statements,
39.14% branches, and 31.73% functions**. Infrastructure coverage is not added to
these percentages. This remains partial backend coverage.

| Module | Line coverage |
| --- | ---: |
| Conversation service | 98.01% |
| Anonymous service | 97.84% |
| Conversation / anonymous controllers | 100% |
| Discovery service / controller | 100% |
| Device model | 100% |
| Wallet, coin and subscription services | 100% |
| Wallet, coin and subscription controllers | 100% |
| Cron scheduling utilities | 100% |
| Authentication middleware | 100% |
| Recommendation client | 100% |
| Task services | 100% |
| Shared service utilities | 100% |
| General utilities | 100% |
| Wallet sync / game helpers | 99.20% |
| Authentication service | 98.27% |
| Authentication controller | 98.18% |
| Payment service | 97.36% |

The first pass covers authentication services/controllers, account access and bot
middleware, recommendation response validation and fallback, feed controller and
hydration, post visibility and reply/poll/quiz permissions, user/post serializers,
payment verification and plan synchronization, wallet transfers, task services,
location/tip/push-subscription services, validation schemas, Redis wallet sync,
game scoring helpers, ranking keys, JWT/encryption and date utilities. The
second pass adds wallet funding, independent bonus cooldowns, task rewards,
coin purchase ledger entries and lock cleanup, subscription purchase/renewal/
cancellation, authenticated financial controllers, and queue scheduling/removal.
The third pass adds conversation lookup, membership checks, pagination, key
registration/consumption/revocation, read/seen receipts, discovery SQL parameter
binding and serialization, follow/block/mute history, report cooldowns and
profile visits. PostgreSQL messaging, including request isolation and concurrent
prekey claims, is covered by the infrastructure suite. The fourth unit pass adds account-status
authorization, user queries/notifications, post reaction/bookmark/delete/restore
mutations, game catalog/room lookup and administrator-only wallet funding.

Coverage includes **all source TypeScript**, including untested modules, except
type-only declarations. High percentages for a tested module do not imply that
the whole application is covered. The global floor starts low because large
user/post/game services are still mostly untested. Per-module thresholds protect
the core modules already covered. Raise the global floor as coverage expands;
do not exclude uncovered business logic to improve the percentage.

Known fixes discovered by the tests:

- Referral age is elapsed time since creation, with a ten-day boundary.
- Previous-month reward calculations cannot roll forward on the 29th–31st.
- Random timer selection includes the last configured timer.
- Missing leaderboard statistics become zero rather than `NaN`.
- Tag/mention flattening preserves repost state and handles absent relations.
- Coin task rewards increment `coins`, and ad rewards use the ad cooldown.
- Coin purchases stop on cache reconciliation errors, respect existing wallet
  locks, and attempt to release their acquired lock when a transaction fails.
- Transfers and bonus claims use the authenticated user rather than a body-supplied
  identity; HTTP subscription cancellation filters by the authenticated owner.
- Transfer errors preserve the service error message.
- Topic-job removal targets the topic queue rather than the embedding queue.
- Conversation lookup matches participant ID fields rather than whole embedded
  documents, and conversation lists now apply their pagination arguments.
- Message pages require membership, query the actual `conversation` field, and
  return an oldest-message cursor while preserving chronological output.
- Device revocation uses the correct route parameter and a persisted schema
  field; recipient device queries exclude revoked devices. One-time prekey
  claims match a single unconsumed array element and require a successful write.
- Seen-only updates respect the requested conversation; combined read/seen
  updates only append whichever receipt is missing.
- Account status changes require ownership or administrator privileges; regular
  users cannot set moderation statuses or reactivate suspended/banned accounts.
- Post deletion/restoration checks the actor's role rather than the author's.
- Direct wallet funding requires an ADMIN or SUPER role.
- Authentication accepts the `tx_a_t` cookie actually issued by signin/signup,
  while retaining support for the older `x_a_t` cookie.
- Follow/block/mute history uses the transaction client. Cancelling a request
  is not recorded as an unfollow, and suspended accounts can be unfollowed.

## Test conventions

- Put unit suites in `tests/unit/*.test.ts`; test public behavior and error paths.
- Mock external boundaries explicitly using `vi.mock` and `vi.hoisted`.
- The default database/cache mocks fail on unexpected access. TCP connections
  and unmocked fetch calls are blocked. Never import the application entrypoint.
- Use fake timers for expiry/reward/retry tests and restore them afterwards.
- Reset only your own mocks; `vi.resetAllMocks()` can remove the network guards.
- Keep real Zod schemas and serialization functions when testing their callers.
- Include invalid input, missing records, permission denial, provider failures,
  boundary values and checks that rejected operations make no writes.
- Assert transaction composition here; rollback, concurrency and constraints
  require real-database integration tests. A mock does not prove atomicity.

## Real infrastructure and HTTP tests

Docker must be running. With dependencies installed and Prisma generated:

```sh
npm run test:all
```

The runner starts only the `kwonserver-tests` Compose project from
`tests/docker-compose.yml`. It uses loopback ports 15432 (PostgreSQL), 16379
(Redis), hardcoded test credentials and an isolated
`kwonserver_test` database. Data lives in disposable containers/tmpfs. It runs
**the committed Prisma migration history with `migrate deploy`**, then removes
test containers and volumes after success or failure. It never runs deployment
scripts or resets an application database. Tests reject other PostgreSQL URLs.
Run infrastructure commands sequentially because they share these fixed ports.
After forcibly terminating the runner, clean up with:

```sh
docker compose -f tests/docker-compose.yml down --volumes --remove-orphans
```

Coverage of real infrastructure:

- PostgreSQL follows/cancellations, block/mute histories, post counters and
  notifications. Failure-injection triggers prove follow-history and like-counter
  rollback against PostgreSQL, not just mocked transaction calls.
- PostgreSQL Signal messaging: pending request previews, exact receipts, device
  revocation, idempotent sends, private blobs and concurrent prekey claims.
- Redis delayed-job persistence/removal and duplicate job IDs, plus actual wallet
  balance synchronization between Redis and PostgreSQL.
- HTTP signup, duplicate signup, bad-password rejection, signin, bearer/cookie
  sessions, suspended-user denial, conversation creation/read/ownership, wallet
  funding permissions, transfers with forged sender input, and fee insufficiency.

The HTTP suites mount production feature routers and middleware in a local test
server. They do not boot `src/index.ts` (which starts schedulers and sockets),
exercise a browser, call live payment providers, or connect to deployed kwonrec.
The unused root router is stubbed to prevent unrelated background initialization.
GitHub Actions runs both unit and infrastructure jobs; local runs were verified,
while the remote workflow requires pushing the changes.

## Coverage gaps

The suite is runnable across all three test layers, but **34.90% line coverage
is not comprehensive backend coverage**. Remaining areas include:

1. Large post creation/reply/quiz paths, user analytics and connection queries,
   game lifecycle/payouts, socket handlers and background workers.
2. Concurrent wallet operations, duplicate provider callbacks/rewards, subscription
   retry/idempotency, discovery SQL semantics and recommendation outbox delivery.
3. Full HTTP flows for post creation/feed personalization, paid subscriptions and
   games; a running isolated kwonrec service and browser-level user journeys.

Keep expanding these areas without excluding source files or replacing real
behavior with mocks solely to raise the coverage number. The existing
`test:integrations` (plural) retains its historical meaning: retired-provider
regressions. Use `test:integration` (singular) for the real database suite.

## Trending database integration

`npm run test:integration` now prepares extensions and analytics before testing.
The new trending suite exercises rendered-text extraction, all n-gram lengths,
atomic edit/delete handling, visibility, exact author counts, concurrent edits,
and resumable/idempotent backfill on disposable PostgreSQL.

To also exercise TimescaleDB hypertables and continuous aggregates:

```sh
TEST_POSTGRES_IMAGE=timescale/timescaledb-ha:pg17 npm run test:integration
```

The test database always uses the guarded local fixture URL; it never reads a
production database URL. Docker removes the test containers and temporary data
when the suite finishes.
