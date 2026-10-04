# Automatic kwonserver deployment

Push to `main` (or run the deployment workflow manually). GitHub tests/builds
kwonserver, publishes an immutable image to Artifact Registry, uploads the deploy
script over IAP, and installs/starts Docker containers on the VM. No Compose
file, manual install command or separate initialization run is required.

Only kwonserver and its BullMQ worker deploy here. kwonweb, kwonrec and existing
PostgreSQL, MongoDB and Redis remain on their current hosts.

## GitHub configuration

Use **Settings → Environments → production → Environment secrets**:

- GCP_COMPUTE_ENGINE_PROJECT
- GCP_COMPUTE_ENGINE_ZONE
- GCP_COMPUTE_ENGINE_NAME
- GCP_WIF_PROVIDER
- GCP_DEPLOY_SERVICE_ACCOUNT
- GAR_LOCATION
- GCP_COMPUTE_ENGINE_EXTERNAL_IP (optional reference for DNS; IAP does not use it)

Also add **KWONSERVER_ENV**, a multiline secret containing the complete application
runtime configuration currently used on Cloud Run. The seven infrastructure
secrets do not supply database credentials or application settings. If this
secret is empty, deployment reuses `/opt/kwonnet/env/kwonserver.env` if it exists;
otherwise it fails with a clear error. A supplied secret replaces the whole file.

Use Docker env-file format: one KEY=value per line, no `export`, no surrounding
quotes, no variable interpolation. Include all existing production settings,
plus API_DOMAIN and ACME_EMAIL for automatic HTTPS, for example:

```dotenv
API_DOMAIN=api.example.com
ACME_EMAIL=admin@example.com
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
REDIS_URL=redis://HOST:6379
MONGO_URL=mongodb://HOST/DATABASE
JWT_SECRET=YOUR_EXISTING_SECRET
ENCRYPTION_KEY=YOUR_EXISTING_KEY
REMOTE_APP_URL=https://YOUR_EXISTING_WEB_DOMAIN
KWONREC_API=http://REACHABLE_PRIVATE_RECOMMENDER_ADDRESS:8001
KWONREC_API_KEY=YOUR_EXISTING_SERVICE_KEY
JOBS_TIMEZONE=UTC
```

Include your existing payment, email, storage, push and AI credentials too.
Keep existing JWT/encryption keys and data service URLs. Set
DATABASE_MIGRATION_URL if Prisma needs a direct database URL rather than the
runtime transaction pooler. The script preserves existing VM env files in a
root-only history directory before replacing them. It never prints their values.

## Infrastructure prerequisites

The configured WIF identity must already have permission to push to the `kwonnet`
Docker repository in GAR_LOCATION and use IAP/OS Admin Login on this VM. The
Artifact Registry repository must exist. Enable OS Login on the VM, allow IAP SSH
from 35.235.240.0/20, and grant Service Account User on the VM's attached service
account where required. Adding GitHub secrets alone does not grant IAM access.
The workflow uses its short-lived registry token for pulling images, so a separate
VM registry credential is unnecessary.

Use Debian/Ubuntu on the VM. Docker is installed automatically if absent; Python3
is installed if needed. The VM needs outbound access to package repositories,
Artifact Registry and your data services. Reserve a static external IP, point
API_DOMAIN's DNS A record at it, remove conflicting AAAA records, and allow public
TCP 80/443. Ports 8000, 8001 and database ports should stay private. Ports 80/443
must be free on the target VM for the HTTPS proxy.

Before first deployment, disable any previous GitHub/Cloud Build trigger that
deploys this same backend elsewhere. Disable background jobs on the old Cloud
Run API and stop old kwonserver workers before enabling the new one. Keep kwonrec's
own worker running. On a new VM, the old VM's localhost/Docker hostnames are not
reachable: configure private network access to kwonrec and your data services.
The earlier manual Compose deployment should not run alongside this one.

## What happens on push

1. Existing unit/regression/integration/e2e tests run.
2. GitHub builds and publishes the image; production env values are not baked in.
3. The VM validates runtime configuration and the HTTPS proxy, then runs Prisma
   migrations/reference seeding before replacing containers.
4. Docker starts `kwonserver`, `kwonserver-worker`, and `kwonserver-proxy`.
5. Deployment waits for API health, tests the Socket.IO handshake, and checks that
   the worker has not exited/restarted. Authenticated chat/game flows and actual
   job processing still need functional monitoring.

A migration failure leaves existing containers running. Failures after
replacement may leave the attempted release running; the workflow reports
failure. There is no automatic database rollback. `/opt/kwonnet/image` records
the last successful image; previous records are in `/opt/kwonnet/history`.
Revert a code commit and push to redeploy only if its schema remains compatible.

Docker restart policies survive VM reboot. Deployments briefly disconnect sockets.
Caddy keeps certificates in persistent Docker volumes and renews them automatically.
Do not delete these volumes. Application data stays in the existing external
services. Keep one API replica while games/Socket.IO rooms use local process state.

View logs if needed (deployment itself requires no manual VM command):

```bash
sudo docker logs --tail=100 kwonserver
sudo docker logs --tail=100 kwonserver-worker
sudo docker logs --tail=100 kwonserver-proxy
```

After the first release, verify public HTTPS, login, chat, games and recommendations
before retiring Cloud Run. Update the existing frontend's NEXT_PUBLIC_API_URL if
the public API hostname changes. This workflow does not deploy the frontend.

## Artifact Registry upload errors

If publishing fails with `Unauthenticated request`, check the workflow's named
Google authentication and Docker authentication steps. Docker now logs in with
an explicit short-lived service-account token in an isolated credential directory.
The repository check runs before publishing and verifies Docker format.

In Google Cloud Console, select the project in GCP_COMPUTE_ENGINE_PROJECT, open
Artifact Registry → Repositories, and verify `kwonnet` exists in GAR_LOCATION.
Grant the exact email in GCP_DEPLOY_SERVICE_ACCOUNT the **Artifact Registry Writer**
role on that repository. WIF authentication alone does not grant registry writes.
If the repository is missing, create a Docker repository named `kwonnet` in that
region. Push the workflow change before retrying; rerunning an older failed run
still uses the old workflow revision.

If the API health check or worker status check fails, deployment prints container state and the last 80 log lines for both containers. Configured environment values and URL passwords are redacted before output. Review the `Startup diagnostics` sections in GitHub Actions; a failed check never records the release as successful.

## View container logs in Google Cloud

After pushing this change, the API, worker and Caddy proxy use Docker's `gcplogs`
driver. No additional GitHub secret or Ops Agent configuration is needed. The
Docker daemon uses the VM's attached service account through instance metadata.
Enable the Cloud Logging API in that project and grant that account **Logs Writer**
(`roles/logging.logWriter`). Its VM access scopes must include
`https://www.googleapis.com/auth/logging.write` or `cloud-platform`.
The deployment checks an actual Logging API write before migrations or container
replacement. A failed check leaves existing services running and reports the
required IAM/scope/network settings; it does not change IAM automatically.

Open Google Cloud Console → Logging → Logs Explorer, select the VM's project,
and use:

```text
resource.type="gce_instance"
log_id("gcplogs-docker-driver")
jsonPayload.container.name=~"^/?kwonserver(-worker|-proxy)?$"
```

Click **Run query**, or **Stream logs** to follow new entries. To narrow to one
container, replace the last line with one of these (Docker may prefix names with `/`):

```text
jsonPayload.container.name=~"^/?kwonserver$"
jsonPayload.container.name=~"^/?kwonserver-worker$"
jsonPayload.container.name=~"^/?kwonserver-proxy$"
```

Use only one of those three lines at a time. Log text is in `jsonPayload.message`;
JSON application messages may be nested as strings. Do not assume that an ERROR
severity filter finds every application error. Add a VM instance filter if more
than one VM runs containers with these names. Preflight entries have log ID
`kwonserver-deployment`.

Only new logs from recreated containers are forwarded; historical local logs are
not imported. The API/worker/proxy stdout and stderr are collected, not arbitrary
application files or Caddy HTTP access logs (access logging is not enabled).
`docker logs` and deployment diagnostics still use Docker's bounded local cache
(three 10 MB files per container). Nonblocking delivery uses a 4 MB buffer so
logging delays do not stall application output; logs can be dropped when buffers
fill or delivery fails. This is not an audit-log delivery guarantee.
Environment variables and startup commands are not attached as log metadata;
application-emitted content itself is forwarded unchanged. Cloud Logging storage
and retention follow the project's settings and may incur usage charges.

References: [Docker gcplogs](https://docs.docker.com/engine/logging/drivers/gcplogs/)
and [local log cache](https://docs.docker.com/engine/logging/dual-logging/).

## Persistent quiz inventory

Deployment applies the new `QuizQuestion` migration through the existing
`db:deploy` step. The existing worker container starts the `quiz-generation`
BullMQ worker; no additional container or manual setup command is required.
Keep the existing OpenAI credentials available to the worker. No live deployment
or real model request is performed by the automated tests.

Quiz rounds now select permanent PostgreSQL questions, using Redis sets of IDs
as a cache. The first request for an empty category queues generation and uses
the game's existing chat/wait fallback. The background worker generates batches,
validates them, skips duplicates and persists valid questions. Other categories
are not generated until requested. Existing procedural word/luck games are unchanged.

Each room keeps a Redis set of seen question IDs until room cleanup. Atomic ID
claims prevent repeats across concurrent selectors. Other rooms can reuse those
questions: delivery never removes anything from the global bank. Redis loss can
lose room history, like other existing room state, but permanent questions survive
and category caches rebuild from PostgreSQL without calling the model.

Optional settings can be added to the existing `KWONSERVER_ENV` GitHub secret
(the same runtime environment used by the API and worker):

```dotenv
QUIZ_INITIAL_TARGET=100
QUIZ_DEFAULT_TARGET=200
QUIZ_LOW_THRESHOLD=50
QUIZ_CRITICAL_THRESHOLD=20
QUIZ_GENERATION_BATCH_SIZE=50
QUIZ_WORKER_CONCURRENCY=3
QUIZ_MAX_TARGET=2000
QUIZ_MAX_BATCHES_PER_JOB=20
QUIZ_GENERATION_ATTEMPTS=3
QUIZ_GENERATION_TIMEOUT_MS=90000
QUIZ_FAILURE_COOLDOWN_SECONDS=900
QUIZ_DEMAND_WINDOW_SECONDS=3600
QUIZ_CACHE_SECONDS=3600
QUIZ_BATCH_INTERVAL_MS=1000
QUIZ_GENERATION_MODEL=gpt-6-luna
```

Concurrency is enforced globally across worker replicas, not just per process.
Batch spacing and concurrency bound provider traffic; increase spacing or lower
concurrency for smaller provider quotas. Transient failures use exponential
backoff. Three consecutive batches with no valid new questions stop that job;
failed jobs have a cooldown before demand can enqueue another attempt.

Targets grow with recent peak room consumption plus a diversity buffer, capped
by `QUIZ_MAX_TARGET`. Active-room and request counters are also recorded for
future tuning; request counts do not decrement global inventory. A room that
exhausts the configured cap waits rather than repeating questions. Set a larger
cap if your room lifecycle needs more unique questions.

On the VM, inspect or warm a specific category using its database ID:

```bash
sudo docker exec kwonserver npm run quiz:inventory -- status CATEGORY_ID
sudo docker exec kwonserver npm run quiz:inventory -- ensure CATEGORY_ID
sudo docker exec kwonserver npm run quiz:inventory -- rebuild CATEGORY_ID
```

`ensure` applies the same thresholds as gameplay; it does not synchronously call
the generator. `rebuild` repopulates only Redis IDs. In Logs Explorer, filter the
worker's logs for `Quiz inventory batch persisted` to see requested, generated,
invalid, duplicate and inserted counts, durations, target, priority and attempt.
For failed job details, inspect the BullMQ `quiz-generation` queue; generation
failure logs include its job ID. Validation guarantees structure and normalized
deduplication, not factual correctness or semantic uniqueness; those still need
content-quality review.

## Redis connection budget and diagnostics

A single API process with `RUN_BACKGROUND_JOBS=false` now uses two baseline
connections (application commands and shared queue/inventory commands), plus one
lazy cache connection after a cached request. No BullMQ Workers are constructed
in that process. Each Worker needs a separate blocking connection even with
`autorun:false`, so importing worker constructors in the API is not safe.

The background process uses approximately 12 connections: one application client,
one queue/inventory client, one shared client for the five job workers and their
five blocking clients, two for recurring jobs, and two for quiz generation. It
can use an additional cache client if it executes code that accesses the cache.
Thus one API plus one worker needs about **15 connections (up to 16 with worker
cache use)**, excluding diagnostics, deployments, kwonrec, local development and
old Cloud Run revisions. Each extra process multiplies its budget. Worker
concurrency is the number of concurrent jobs, not that many new Redis clients.

Before this fix the API also opened six unused worker connections and inventory
opened an extra client in each process. More seriously, every cached read/write
constructed a new Keyv Redis client without closing it. Cache clients are now
singletons and disconnect during shutdown. Restart/redeploy old processes to
release their previously leaked connections; running an old revision preserves
the old behavior. Confirm obsolete Cloud Run services are stopped or deleted
once they are no longer needed.

After deployment, run this read-only diagnostic on the VM:

```bash
sudo docker exec kwonserver npm run redis:connections
```

It reports Redis's total connected/blocked clients and groups client names when
`CLIENT LIST` is permitted. It omits credentials, IPs and usernames. The diagnostic
itself temporarily uses one connection. Provider dashboards remain authoritative
if administrative commands are restricted. Never paste a full `CLIENT LIST` or
Redis AUTH error into public logs; AUTH arguments can contain the password.

`kwonrec` has a separate pool in each API/worker process, configurable with
`KWONREC_REDIS_MAX_CONNECTIONS` (default 16, previously 100). Connections open on
demand, not all at startup; account for each process if it shares this Redis
service. Cluster pools apply limits per node. Its production Compose normally
uses its own Redis container, in which case it does not consume this managed
Redis database's allowance. Verify the deployed endpoints before adding budgets.

### Wallet source-of-truth migration

Before deploying the wallet integrity release, follow the maintenance/reconciliation
steps in [wallet-integrity.md](../../docs/wallet-integrity.md). Old Redis wallet
snapshots must be reviewed before enabling PostgreSQL-authoritative game charges;
this release does not automatically repair historical balances.

### Database extensions and trends

The existing release command `npm run db:deploy` now also prepares pgvector,
TimescaleDB (when supported), trending extraction triggers, analytics summaries
and the resumable post backfill before replacing running containers. Keep the
same `DATABASE_URL` and optional direct `DATABASE_MIGRATION_URL` in
`KWONSERVER_ENV`. Optional `TIMESCALEDB_MODE=required` makes missing TimescaleDB a
release failure; the default `auto` supports PostgreSQL-only and Apache-licensed
hosts using live views. First-time history indexing logs batches; completed
backfills are skipped on subsequent pushes. See the root README for hosting
requirements and verification SQL. Deployment never changes the database host.
