# Queued weekly and annual game rewards

The four scheduled milestone payouts use `gameMilestoneRewardQueue` (BullMQ):

| Kind | Durable task scope | Winners and score source |
| --- | --- | --- |
| WEEK | Category, mode, ISO week/year | Top three IDs/scores from the previous week's Redis ranking |
| YEAR | Category, mode, previous calendar year | Top three by sum of `GameMonthStat.score` |
| CHAMP | Game, mode, previous calendar year | Highest sum across that game's categories |
| GRAND_CHAMP | All games and modes, previous calendar year | Highest combined score |

Existing cron schedules remain unchanged. Cron handlers only create PostgreSQL
`GameMilestoneRewardTask` rows and enqueue their IDs. They do not credit wallets.
All yearly tasks pin `yearlyRewardYear`, rather than using a monthly date or
recomputing the current date during recovery. Annual ties resolve by player ID
ascending; weekly ties retain Redis reverse-ranking order. Annual queries sum
in PostgreSQL and use `ORDER BY ... LIMIT 3/1`, avoiding player hydration and a
window sort over every ranked player. The new year-first index is built
concurrently so deployment does not block game-stat writes.

## Frozen plans and payment

Each task freezes its bounded winner list and milestone configuration in `plan`
before payment. The first plan committed wins a compare-and-set. Retries cannot
substitute a different recipient, score, amount, reward type, label or period.
A missing or ambiguous milestone fails the task for correction instead of
silently omitting an eligible rank. Empty rankings complete with zero payouts.
Weekly planning still depends on the original Redis ranking until the plan is
saved; recovery cannot reconstruct an expired, never-snapshotted weekly ranking.

Configured `GameMilestone.reward` and `rewardType` are preserved for these four
reward types, including BONUS milestones. The coins-only monthly pool policy is
unchanged. Room winning-streak rewards remain immediate game events; quiz reward
settlement and engagement task rewards use their existing flows.

At most three wallets are credited per task in one bounded database transaction:

1. Lock the task and legacy award receipts, in deterministic order.
2. Check the original per-player wallet-operation IDs and fingerprints. Already
   paid recipients are skipped, including awards made before this queue rollout.
3. Lock pending wallet rows in user-ID order; increment all balances in one SQL
   statement. Missing wallets or constraint failures roll back the entire task.
4. Bulk insert ledger entries, linked achievements, inbox notifications and
   per-player receipts. Commit task completion and actual new-credit totals
   atomically with the batch receipt.

The old receipt namespaces/keys are retained. The new batch receipt and frozen
plan protect concurrent jobs and retries; BullMQ job IDs alone never authorize
payment. PostgreSQL wallets remain authoritative. After commit, the worker
invalidates the affected Redis wallet caches in one command instead of writing
an old snapshot over a newer game debit. Cache failure leaves `cachePending=true`
and retries invalidation without re-crediting wallets. Active game debits and
rewards coordinate through the existing PostgreSQL wallet row locks.

## Queues, recovery and deployment

Default global/local payout concurrency is 4. Global limits apply across replicas
of this queue; monthly payouts retain their own existing limits, so budget the
database connection pool for both. These milestones have at most three winners
per scope and do not need monthly-style 500-player cursor batches. Different
scopes run independently without one long cron job blocking other rewards.

Jobs retry five times with exponential backoff starting at five seconds. The
minute watchdog and worker startup recover due unfinished/failed tasks and
completed payments with pending cache invalidation, including older periods and
jobs lost from Redis. PostgreSQL task state survives queue loss. Queue entries
contain only a task ID; enqueue fanout is bounded at eight concurrent requests,
and each recovery pass takes at most 1,000 due tasks, oldest first.

Inbox notifications commit with payments and are visible to the recipient's SSE
snapshot. Device delivery is queued in a bulk Redis request using the existing
notification queue. The durable notification outbox, row leases, per-device
markers and push retry limit handle delivery independently of payout completion.
Reward device notifications open `/wallet`. Run the normal notification workers
or recurring push watchdog alongside dedicated reward workers.

Deploy with the new migrations and regenerate/build Prisma. The main background
worker starts milestone workers automatically unless
`RUN_MILESTONE_REWARD_WORKERS=false`. `npm run start:reward-worker` starts both
monthly and milestone payout workers for a separate reward deployment. Configure:

```
MILESTONE_REWARD_GLOBAL_CONCURRENCY=4
MILESTONE_REWARD_LOCAL_CONCURRENCY=4
```

Both accept integers 1–16. Use identical global settings on every replica. Stop
old reward worker versions before rollout when possible; legacy receipt locking
protects the same recipients, but cannot freeze the winner selection of an old
version that never created a durable task.

## Audit and troubleshooting

`GameMilestoneRewardTask` retains kind, scope, mode, year/week, original ranking
key, frozen plan, processed count, previously paid count, actual new coins/bonus
paid, notification IDs, cache-pending flag, failure count/error, next attempt,
start/completion/create/update timestamps. `processed` includes legacy recipients;
`coinsPaid` and `bonusPaid` count only credits made by this task. The plan records
target amounts, and legacy receipts/transactions provide historical payments.
There is no funding pool for fixed milestone awards, so these tasks do not
pretend to have monthly pool or unallocated-balance fields.

```sql
SELECT kind, year, week, status, COUNT(*) AS tasks,
       SUM(processed) AS recipients, SUM("previouslyPaid") AS legacy_recipients,
       SUM("coinsPaid") AS new_coins, SUM("bonusPaid") AS new_bonus,
       COUNT(*) FILTER (WHERE "cachePending") AS cache_pending
FROM "GameMilestoneRewardTask"
GROUP BY kind, year, week, status ORDER BY year DESC, week DESC, kind, status;

SELECT id, kind, "scopeId", mode, year, week, failures, "lastError", "nextAttemptAt"
FROM "GameMilestoneRewardTask"
WHERE status <> 'COMPLETED' OR "cachePending" ORDER BY "nextAttemptAt";
```

Correct a missing wallet/configuration before retrying. Do not edit a frozen
plan or delete receipts to replay a payment. Failed tasks remain recoverable;
there is no guaranteed completion time independent of database capacity and data
errors. Device delivery is not part of financial completion.

Integration coverage exercises all four dispatchers and real BullMQ workers,
multiple replicas/global concurrency, empty scopes, deterministic annual ties,
mode/year boundaries, frozen winners and amounts, missing-wallet rollback,
legacy receipts, concurrent retry, cache failure after commit, queue-loss
recovery, achievements, ledger totals and recipient SSE/inbox/queued pushes.
