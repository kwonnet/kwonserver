# Monthly reward processing strategy

This document describes execution and scaling. The reward policy, actual bonus
offset, qualifying tiers, pool percentages, rank curve and 500,000-coin ceiling
remain in [monthly-game-rewards.md](monthly-game-rewards.md).

The objective is the shortest safe completion time supported by the deployed
database and workload. There is no artificial one-day deadline or fixed completion
guarantee. Category count alone does not determine runtime: sum qualifying payout
positions across all category/mode combinations, including separate awards to the
same user in different categories.

## Queue topology and workflow

1. At the existing monthly schedule (`0 2 1 * *`, `JOBS_TIMEZONE`, UTC by default),
   the cron dispatcher creates one durable `MonthlyRewardSettlement` row per
   category, game mode and previous UTC month. It uses `createMany` with duplicate
   protection and queues a pointer to each row. The shared cron consumer returns
   after dispatch; it is not occupied for the whole payout run.
2. Dedicated workers consume `monthlyRewardQueue`. The first step freezes the
   leaderboard, aggregates actual committed spending, calculates the existing
   reward curve and saves the plan/audit atomically. Category name and milestone
   definitions are saved with new plans, avoiding repeated context reads per winner
   or batch. Older plans without context remain supported.
3. A step reads the original accounting period and committed cursor, fetches at
   most 500 ranked recipients, then settles that batch. It never derives an old
   task's period from the worker's current month.
4. After commit, the category's next rank becomes a new step at the back of the
   FIFO queue. Other waiting categories get worker time between batches. A large
   category no longer occupies a worker until all its winners finish. Every mode
   has an independent task and financial plan.
5. The last step verifies qualifying count and pending balance, finalizes the
   financial audit through the existing receipt, and marks the durable task
   complete. A completed audit also allows recovery to close a task if a process
   died between financial finalization and task completion.
6. Device delivery uses `monthlyRewardNotificationQueue`, independently of payout
   execution and general post/email delivery. It does not gate financial completion.

This is a durable work-queue and transactional-outbox design. Redis jobs provide
at-least-once execution, not financial exactly-once delivery. The database receipts,
wallet locks and atomic commits provide duplicate-payment protection.

## Atomic payment transaction

Implementation: [monthlyRewardSettlement.ts](../src/services/walletLedger/monthlyRewardSettlement.ts).

The existing payment batch and per-player identities are preserved. A batch:

- Acquires its operation lock, then original per-player operation locks in sorted
  order. Older individual-award receipts are honored and fingerprints checked.
- Locks unpaid wallets in user-ID order using one query. These are the same wallet
  rows used by live game debits, so concurrent balance changes are preserved.
- Updates different wallet amounts with one parameterized `UPDATE ... FROM VALUES`.
- Bulk inserts transaction ledger entries, monthly achievements, inbox notifications
  and individual receipts. Transaction-to-wallet/achievement links are retained.
- Increments the financial audit once for the newly processed recipients and amounts.
- Advances the durable rank cursor and creates a `MonthlyRewardDelivery` outbox row
  when the batch contains notification IDs. The enclosing helper saves the batch
  receipt, including those IDs, in the same transaction.

A failure rolls back the entire current batch. Earlier batches stay paid. The
fixed maximum is 500 positions, keeping wallet lock duration and transaction size
bounded. Missing wallets, altered snapshots or conflicting receipts fail for
reconciliation; the system does not skip a player and falsely report payment.

## Durable records and queue identities

| Record | Role |
| --- | --- |
| `MonthlyRewardSettlement` | Category/mode/month work registry; `PENDING`, `PROCESSING`, `FAILED`, `COMPLETED`; retry time, failure count and last error |
| `GameMonthRewardStat` | Financial audit: spent amounts, funding, pool, paid/pending/unallocated amounts and processed counts |
| `WalletOperation` plan | Immutable financial plan and original snapshot key |
| `WalletOperation` individual award | Once per player/category/mode/year/month payment identity |
| `WalletOperation` batch | Once per audit/first-rank/last-rank batch; notification IDs live here |
| `WalletOperation` cursor | Next unvisited rank; changes only with committed batches |
| `MonthlyRewardDelivery` | Durable notification-batch outbox, referencing the batch receipt and settlement |
| `Notification` | User inbox/SSE record and per-device push retry/lease state |

The settlement ID equals the existing SHA-256 monthly plan identity. A unique
constraint also covers category/mode/year/month. Jobs carry only `settlementId`
or `batchId`, not recipient arrays or user-provided payout amounts.

Payment job ID: `monthly-reward-<settlementId>-<nextRank>`.
Notification job ID: `monthly-reward-notifications-<batchReceiptId>`.

Queue IDs reduce redundant work. Receipts and wallet locking remain authoritative
if jobs are retried, recreated, stalled or consumed by different replicas.

## Concurrency and deployment

| Environment variable | Default | Meaning |
| --- | ---: | --- |
| `MONTHLY_REWARD_GLOBAL_CONCURRENCY` | 4 | Maximum active payout jobs across all replicas; valid 1–64 |
| `MONTHLY_REWARD_LOCAL_CONCURRENCY` | 4 | Maximum active payout jobs in one worker process; valid 1–16 |
| `MONTHLY_REWARD_NOTIFICATION_CONCURRENCY` | 1 | Global and per-process cap for notification batch jobs; valid 1–4 |
| `RUN_MONTHLY_REWARD_WORKERS` | enabled | Set to `false` on general cron workers when operating only dedicated reward worker processes |

Notification batches process subscribed recipients with concurrency four and bulk
process recipients without eligible devices. Increase push concurrency only when
provider limits, connection counts and database load allow it.

All reward worker replicas must use the same global-limit settings: startup sets
the shared BullMQ limits. Adding replicas does not bypass the global cap. Separate
processes permit independent scaling and restarts, but do not multiply database
throughput automatically.

Deploy the migrations before starting the updated workers:

```sh
npm run build
npm run db:migrate:deploy
```

Required migrations:

- `20261019110000_monthly_reward_funding_index`: concurrent partial index for
  committed game-debit category/mode/month aggregation. It must run outside an
  explicit transaction. A large existing ledger can take time to index.
- `20261019120000_monthly_reward_work_queue`: work-registry/outbox tables, unique
  period identities and indexes for due work.

The usual `npm run start:worker` starts monthly queue workers by default, alongside
other background services. For independent scaling:

1. Set `RUN_MONTHLY_REWARD_WORKERS=false` on the general background worker. Keep it
   running to register monthly dispatch and other existing cron schedules.
2. Start one or more dedicated processes using `npm run start:reward-worker`.
   Development equivalent: `npm run dev:reward-worker`.
3. Keep database/Redis configuration consistent. Size database connection pools
   across **all** processes; the existing `DATABASE_URL` `connection_limit` setting
   controls each process's pool. Separate reward processes still share database
   CPU, storage, locks and write bandwidth with gameplay.

Each reward worker service runs recovery on startup and every minute independently
of the shared recurring-job consumer. Graceful shutdown stops recovery, waits for
active jobs and closes worker connections. In-flight jobs interrupted by a hard
termination may be recovered as stalled jobs; their financial receipts remain safe.
The dedicated process has a 30-second graceful-shutdown deadline.

## Automatic recovery

Jobs get five attempts with exponential backoff starting at five seconds. Stalled
jobs may be recovered three times. Durable failed settlements remain available for
the watchdog even after BullMQ exhausts/removes a job; their recovery delay grows
from one to at most 30 minutes after repeated failures. Successful payment progress
clears the failure count. Explicit monthly redispatch can retry the existing task
without waiting for the watchdog.

The worker-local recovery loop and `recover_monthly_rewards` minute cron both
recreate due work with stable IDs. They scan bounded pages of 1,000 tasks/outbox
rows. Scheduling advances the task's next check time, avoiding repeatedly selecting
the same queued page and starving later work. The timestamp is a recovery hint,
not the financial lock or evidence that a payment completed.

| Failure | Recovery |
| --- | --- |
| Cron dies after task registration, before queue submission | Watchdog sees durable pending tasks and enqueues their current cursors |
| Worker dies before payment commit | Current batch rolls back; retry pays it |
| Worker dies after commit, before scheduling the next rank | Watchdog reads the committed cursor and enqueues the next step |
| Redis queue entries are lost | Recreate jobs from PostgreSQL task/cursor/outbox state |
| Run spans a month boundary | Persisted year/month keep ranking and spend keys on the original period |
| Notification queue is unavailable/full/paused | Payment remains committed; delivery outbox is retried separately |
| Worker dies after financial finalization | Completed financial audit closes the durable task on replay |
| Missing wallet or corrupted/missing frozen ranking | Mark failed and retain error; reconcile/restore matching data before retry |

**Queue loss is different from loss of all Redis data.** The frozen ranking is
still stored in Redis. An incomplete settlement requires that exact snapshot;
restore it from backup if lost. It must not be recreated from a changed live
leaderboard. Use Redis persistence/backups and protect unfinished ranking keys
from eviction. Incomplete snapshots have no expiry; completed ones retain the
existing seven-day inspection window. Do not delete payment receipts or manually
reset cursors to force a new calculation.

## Notification backpressure

Positive payments save inbox notifications and a delivery-batch outbox row in the
same database transaction. A Redis notification job points to that batch receipt.
At approximately 1,000 queued/active/delayed notification batches, new work remains
in PostgreSQL; small concurrent dispatch bursts can slightly exceed the high-water
mark. A paused queue also leaves new work in the outbox. This avoids millions of
individual monthly push jobs or recipient arrays occupying Redis.

Notification workers bulk mark users without eligible devices as processed and
reuse the existing authenticated-session checks and push row leases for subscribed
users. Deferred per-device attempts keep the outbox pending until due work finishes
or the existing attempt limit is exhausted. Outbox `COMPLETED` means no eligible
push retries remain; it does not assert device display or successful delivery to
every device. The user inbox/SSE record remains available regardless of push status.

A provider acceptance followed by a crash before its success marker can repeat a
push submission. It cannot repeat wallet credits. General notification recovery
remains available for older awards that predate the new batch outbox.

## Progress and capacity tuning

```sh
npm run rewards:status
npm run rewards:status -- 2026 9
```

The compiled CLI reports per period: settlement/completed/failed/unplanned counts,
qualifying and processed positions, remaining positions, pending/completed
notification batches, average measured processing rate and estimated remaining
payment seconds. No ETA is returned while some categories remain unplanned or
no processing rate has been observed. A fully processed period reports zero.
Without an explicit period, it shows unfinished/recent periods and periods with
pending notification work. Minute cron logs use `monthly_reward_progress`; they omit notification-outbox
counts (null) so a large historical outbox is not aggregated every minute. The
CLI computes those counts on demand. Batch
logs retain category, mode, rank boundaries and elapsed time.

The rate is committed processed positions divided by elapsed time since the first
worker started that period. It includes downtime and planning; it is not a promise
of future throughput. Notification completion has a separate backlog and does not
change the financial ETA.

To tune for speed:

1. Measure a representative, disk-backed staging run with active gameplay.
2. Begin with global/local concurrency four. Increase to eight only if throughput
   improves and database CPU, write latency, lock waits and gameplay latency allow it.
3. If capacity is still idle, increase again within limits or distribute dedicated
   workers across machines. Keep total database connections bounded.
4. Each active batch may acquire up to 500 advisory locks. Check PostgreSQL lock
   memory and transaction limits when raising concurrency substantially.
5. When the database saturates, more Node workers add contention. Increase actual
   database/storage capacity or redesign accounting/storage at that demonstrated
   bottleneck rather than raising concurrency blindly.

There is no hard deadline throttle: work continues as fast as available worker
slots and database capacity allow. The estimate for 600 categories uses the sum of
qualifiers across all their modes divided by **measured aggregate** throughput.
The same account qualifying in multiple categories counts as multiple payouts.

## Verification and measured examples

```sh
npm run test:typecheck
npm run test:unit
node scripts/test-infrastructure.cjs tests/integration/monthly-game-rewards.test.ts tests/integration/monthly-reward-queue.test.ts tests/integration/monthly-reward-throughput.test.ts tests/integration/post-notification-queue.test.ts
```

Tests cover 601 category tasks, two worker replicas sharing a global cap, FIFO
rotation of a multi-batch category, queue loss, commit-to-enqueue failure, older
accounting months, concurrent wallet changes, previous per-user receipts, frozen
plans, financial audit consistency, milestones, inbox/SSE visibility, actual push
queue consumption and recovery of small notification-batch pointers.

On 2026-10-19, an isolated run with PostgreSQL 17 on tmpfs, local Redis and a
10-connection database pool measured:

| Workload | Credits | Elapsed | Aggregate rate |
| --- | ---: | ---: | ---: |
| One category, queued worker | 5,000 | 1.72 seconds | 2,902/second |
| Four categories, global concurrency four | 20,000 | 4.99 seconds | 4,010/second |

Timers include durable dispatch, real BullMQ consumers, planning, financial/inbox/
outbox writes and batch notification submission. Fixture setup and device-provider
delivery are excluded. Benchmark JSON files are written to the OS temporary
directory as `kwon-monthly-reward-benchmark.json` and
`kwon-monthly-reward-parallel-benchmark.json`.

These are small local observations, not sustained capacity measurements for
millions of players. There is no automatic fourfold speedup from four workers.
Disk-backed production storage, ledger/index size, network latency, snapshots,
game activity and device delivery can change the result substantially. Use the
live status command and load tests for operational completion targets.

Weekly/yearly/champion rewards now use their own bounded payout queue; see
[Queued weekly and annual game rewards](game-milestone-rewards.md) for rollout,
legacy receipt compatibility, concurrency and audit queries.
