# Monthly game coin rewards

Implemented policy: `monthly-90-v2`.

Monthly leaderboard rewards are paid in **coins only**. The reward pool uses
actual committed spending from PostgreSQL. Recorded bonus spending is deducted
from actual coin spending before funding is calculated; winners still receive
coins only.

## Entry points and scope

- Job: [`reward_top_players_every_month.ts`](../src/cron/recurring/reward_top_players_every_month.ts).
- Policy and curve: [`monthlyRewards.ts`](../src/services/walletLedger/monthlyRewards.ts).
- Spend aggregation: [`game.ts`](../src/services/walletLedger/game.ts),
  `monthlyGameSpendExact`.
- Atomic wallet credits and receipts:
  [`walletLedger/index.ts`](../src/services/walletLedger/index.ts).
- Schedule: [`registry.ts`](../src/cron/recurring/registry.ts), `0 2 1 * *`:
  02:00 on the first day of the month, in `JOBS_TIMEZONE` (UTC by default).

The existing job settles each **category and game mode separately**. SINGLE and
MULTI have separate rankings, spending, pools, receipts and payout ceilings.
The reward period is the previous calendar month, using UTC month boundaries;
changing the scheduler timezone does not change those accounting boundaries.

## Qualification and funding bands

`participantCount` is the cardinality of the frozen monthly leaderboard, not
registered accounts, room entries or the number of rounds played.

| Category/mode participants | Qualifying percentage | Pool percentage of net funding balance |
| --- | ---: | ---: |
| Up to and including 5,000,000 | 20% | 25% |
| Above 5,000,000 through 10,000,000 | 25% | 30% |
| Above 10,000,000 through 50,000,000 | 30% | 35% |
| Above 50,000,000 through 100,000,000 | 32% | 37% |
| Above 100,000,000 | 35% | 40% |

The pool percentage is the qualifying percentage **plus five percentage points**.
Each percentage applies to the entire category/mode population or spending total,
not marginal slices of participants. Crossing a threshold can therefore change
both winner count and funding abruptly.

```text
N = floor(participantCount × qualifyingPercentage / 100)
fundingBalance = max(0, actualCoinSpending − bonusSpending)
poolMinor = floor(fundingBalance × 100 × poolPercentage / 100)
```

Players outside the first `N` positions receive no monthly leaderboard reward.
Absent/empty leaderboards and categories with zero qualifying players still
produce audit rows. In particular, fewer than five participants produce zero
winners; any calculated pool remains unallocated. Zero-activity categories
complete with zero spending, zero pool and zero paid recipients.

### Actual coin and bonus accounting

`monthlyGameSpendExact` includes only transactions that satisfy all of:

- Category `GAME_DEDUCTION`, type `DEBIT`, status `COMPLETED`.
- Matching `catId` and mode in transaction metadata.
- `createdAt` within the previous UTC month: inclusive start, exclusive end.
- If a `gameActionId` is present, its action must have status `DELIVERED`.

Coin spending comes from `metadata.deductedCoins`; bonus spending comes from
`metadata.deductedBonus`. Legacy single-source transactions fall back to their
amount for their corresponding source. Mixed legacy transactions without both
split fields stop settlement for reconciliation.

The returned `coins` and `bonus` totals represent separate debit sources.
The funding policy deliberately offsets bonus spending against actual coin
spending, even though the ledger already stores those sources separately:

```text
fundingBalance = max(0, coins − bonus)
rewardPool = fundingBalance × poolPercentage / 100
```

Examples in the first band (25% pool):

| Actual coins spent | Bonus spent | Net funding balance | Reward pool |
| --- | ---: | ---: | ---: |
| 50,000 | 10,000 | 40,000 | 10,000 |
| 1,200 | 800 | 400 | 100 |
| 100 | 150 | 0 | 0 |

This is a funding reserve rule, not a reclassification of the ledger. Statistics
retain the original source totals. The persisted settlement plan also records
`fundingBalance`. There is no fixed bonus percentage or conversion factor; the
15% used in earlier discussions was an illustrative assumption only. When bonus
spending equals or exceeds actual coin spending, this category/mode has no funded
pool and no player receives a negative credit or a bonus settlement.

PostgreSQL returns aggregate amounts as decimal strings. Pool arithmetic uses
`Prisma.Decimal`, then safe integer minor units. One minor unit is **0.01 coin**.
Pools outside JavaScript's exact safe-integer minor-unit capacity are rejected.

## Payout targets

The following calculations use integer minor units. Let `C = 50,000,000` minor
units, equivalent to the **500,000-coin ceiling**.

```text
budget = min(poolMinor, N × C)
unallocated = poolMinor − budget
average = budget / N

minimum = max(
  floor(90% × average),
  budget − (N − 1) × C
)

maximum = min(
  C,
  max(1 minor unit, floor(5 × average)),
  budget − (N − 1) × minimum
)
```

The normal minimum is **90% of the affordable average reward**, not 90% of a
player's spending. The normal first-place target is **five times that average**,
not an automatic 500,000 coins.

The additional bounds make the endpoints affordable for small populations and
pools close to total payout capacity. For example, with ten winners and a
300-coin budget, the minimum is 27 coins, and the affordable maximum is 57 coins:
a 150-coin first-place award would leave too little for the other nine minimums.

Special cases:

- One winner receives the budget, subject to the ceiling.
- A zero budget produces zero awards and no wallet credit transactions.
- Tiny pools can produce zero awards for some qualifying ranks after rounding.
- When the pool exceeds `N × 500,000 coins`, the excess remains unpaid. It is
  recorded in the plan as `unallocated` and logged; there is no automatic rollover
  or secondary distribution. The distributable average uses the capped budget.
- There is **no spending-recovery or spending-plus-5% guarantee**.

## Rank curve and exact rounding

The implementation uses a **bounded exponential curve**, rather than the earlier
50/50 equal-plus-ranked distribution, inverse-square-root weighting, or the power
curve used in preliminary examples.

For rank `r` out of `N > 1`, set `x = (r − 1) / (N − 1)`. For positive shape `k`:

```text
weight(r) = (exp(−k × x) − exp(−k)) / (1 − exp(−k))
rawReward(r) = minimum + (maximum − minimum) × weight(r)
```

The first weight is 1 and the last is 0. A near-zero shape gives a linear curve;
negative shapes reflect the positive curve to support cap-constrained budgets.
The solver fits the shape to the budget using a closed-form geometric sum and
80 bisection iterations. It does not repeatedly scan all winners while fitting.

Each raw award is floored to a minor unit. Remaining minor units are assigned
one each in rank order, skipping ranks already at the maximum target. This keeps
awards non-increasing by rank, protects the maximum and spends the distributable
budget exactly. `cappedRanks` in the plan counts the initial ranks at the maximum
**target**, which need not equal the 500,000-coin ceiling.

Curve planning makes one O(N) pass to calculate rounding, using constant working
memory. Payouts subsequently fetch recipient batches of 200. Categories/modes
are processed with concurrency two.

Many lower ranks may receive identical amounts after rounding. Tied scores retain
the frozen Redis reverse sorted-set order; this implementation does not combine
or average rewards for tied scores or extend qualification across a cutoff tie.

## Example based on recorded totals

Suppose a category/mode has 50,000 participants, recorded coin spending of
2,975,000,000 coins and recorded bonus spending of 525,000,000 coins.

| Calculation | Result |
| --- | ---: |
| Qualifying players: 20% | 10,000 |
| Net funding: actual coins minus bonus | 2,450,000,000 coins |
| Pool: 25% of net funding | 612,500,000 coins |
| Affordable average | 61,250 coins |
| Normal minimum: 90% of average | 55,125 coins |
| First-place target: 5 × average | 306,250 coins |
| Individual ceiling | 500,000 coins |

The curve distributes the pool between these endpoints, with final cent rounding.
No player spending assumption is used. Individual points determine leaderboard
order; personal spending does not directly determine that player's award.

## Settlement, retries and audit

1. Skip a category/mode/month whose audit status is `COMPLETED` or
   `LEGACY_COMPLETED`. `PROCESSING` and `FAILED` records resume; their existence
   alone must not suppress unpaid awards.
2. Freeze the previous month's sorted set using Redis `COPY` without replacement.
   Snapshot key: `<monthly-ranking-key>:settlement:monthly-90-v2`.
3. Read actual spending, offset bonus spending, calculate the curve and save the plan through
   `walletOperation` scope `monthly-reward-plan`. The period key is
   `<catId>:<MODE>:<year>:<month>`. The same database transaction creates the
   `GameMonthRewardStat` audit row before any award is attempted.
4. On retry, use the persisted plan and frozen ranking. Original leaderboard
   changes and late ledger entries do not alter an existing plan.
   An incomplete plan from `monthly-90-v1` is rejected for reconciliation rather
   than being silently repriced under the new funding rule.
5. Credit winners through `walletOperation` scope `monthly-reward`, with identity
   `<catId>:<MODE>:<year>:<month>:<playerId>:COINS`. Wallet credits, ledger entries,
   applicable monthly milestone achievements, audit progress and receipts commit
   atomically. Processed/paid counters and financial balances cannot advance twice
   on a replay. Zero-value awards update processed progress without minting a
   transaction.
6. After all awards complete, finalize the audit through the `monthly-reward-stat`
   receipt. Finalization requires every qualifying position processed and zero
   pending amount. A partial failure records `FAILED` and `lastError` while
   retaining the actual paid amounts.
7. Retain an incomplete run's snapshot without expiry. After settlement, give the
   snapshot a seven-day inspection window; completed-period replay no longer
   needs it. PostgreSQL plan/payment receipts remain durable.

All payout transactions use source/currency `COINS`, credit `wallet.coins`, and
carry the period, category, mode and policy in metadata. No payout increments
`wallet.bonus`.

## Award notifications and duplicate protection

A positive monthly award creates one `Notification` inside the same transaction
as its wallet credit, transaction ledger entry, audit progress and durable receipt.
Its unique source is
`monthly-game-reward:<catId>:<MODE>:<year>:<month>:<playerId>`. Metadata includes
the credited amount, rank, category, mode, period, transaction ID and audit ID.
Zero-amount positions are processed for audit but do not announce a payment.

After commit, `enqueueNotificationDelivery` schedules an immediate job on the
existing notification queue with a stable notification ID. The worker sends
Web Push to the recipient's valid registered browser/device subscriptions and
links to `/wallet`. Queue failures do not reverse a payment: the durable inbox is
also the push outbox, and `deliver_push_notifications` retries due notifications
every minute. Existing leases, per-device success markers, expired-subscription
cleanup and bounded attempts apply. Provider acceptance does not guarantee device
display, and an external provider acceptance followed by a worker crash can still
cause a repeated push submission; payment and inbox-row idempotency are separate
from transport delivery guarantees.

The authenticated notification SSE stream observes the recipient's saved inbox
and emits `notifications_updated` on its next refresh (normally within five
seconds). This works across worker/API replicas without an in-memory broadcast.
SSE requires an active connection; an offline recipient retains the notification
in the inbox and can receive device push if subscribed. Notification delivery does
not itself refresh an already-open game room's wallet display.

Financial idempotency is **per player, category, mode, year and month**, not once
per player globally. `walletOperation` takes an advisory lock for that operation,
checks its saved fingerprint/receipt, and locks the wallet row before crediting.
A replay returns the saved result without repeating the credit, notification or
audit increments. The unique notification source and stable queue job ID provide
additional duplicate protection. Completed periods are skipped entirely.

## Queryable financial audit

The existing `GameMonthRewardStat` table is the category/mode/month settlement
audit. No separate summary table is needed. New rows use the deterministic plan
receipt ID, and a partial unique index enforces one new-policy row per category,
mode, year and month. Legacy duplicates remain intact for reconciliation.

| Field | Meaning |
| --- | --- |
| `catId`, `mode`, `year`, `month` | Category, game mode and accounting period |
| `policyVersion`, `status` | Applied policy and processing state |
| `coinsSpent`, `bonusSpent` | Actual source-specific ledger spending |
| `grossSpent` | Coins spent plus bonus spent; not cash revenue |
| `bonusOffsetApplied` | Lesser of coins spent and bonus spent |
| `bonusOffsetShortfall` | Bonus spending exceeding actual coin spending, otherwise zero |
| `fundingBalance` | Available after bonus offset: `max(0, coinsSpent - bonusSpent)` |
| `qualifyingPercentage`, `rewardPercentage` | Participant and funding percentages, stored as 20/25/etc. |
| `rewardPoolAmount` | Total calculated reward pool, before the payout-cap restriction |
| `distributableAmount` | Amount the payout curve can allocate under the ceiling |
| `retainedBalance` | Funding balance after reserving the entire pool |
| `coinsShareAmount` | Coins actually credited so far, not merely promised |
| `pendingAmount` | Distributable budget not yet credited |
| `capUnallocatedAmount` | Pool that cannot be allocated because of total winner capacity |
| `unallocatedAmount` | Entire pool not paid yet: pending awards plus cap excess |
| `balanceAfterPayout` | Funding balance less actual paid coins |
| `fullyAllocated` | True only after completion when no pool coins remain unallocated |
| `totalParticipants`, `rewardParticipants` | Population and qualifying positions |
| `processedParticipants`, `coinsRewardParticipants` | Positions processed and recipients actually credited positive coins |
| `rewardParticipantsScore`, `coinsParticipantsScore` | Processed qualifying score totals |
| `minimumReward`, `maximumReward`, `rewardCap` | Applied floor, first-place target and absolute ceiling |
| `snapshotKey`, `payoutPlan` | Frozen ranking reference and curve/rounding parameters |
| `startedAt`, `completedAt`, `lastError` | Processing timing and most recent failure |
| `legacyBreakdown` | Preserved historical split data from removed columns |

Financial identities hold during partial payment as well as after completion:

```text
rewardPoolAmount = coinsShareAmount + unallocatedAmount
rewardPoolAmount = distributableAmount + capUnallocatedAmount
distributableAmount = coinsShareAmount + pendingAmount
fundingBalance = retainedBalance + rewardPoolAmount
balanceAfterPayout = retainedBalance + unallocatedAmount
```

The database migration adds reconciliation checks for new-policy amounts.
`status = COMPLETED` means processing finished; it does not necessarily mean the
whole pool was paid. A cap-constrained settlement can be completed with
`fullyAllocated = false`. A zero pool can complete with `fullyAllocated = true`
and zero paid recipients. A category with participants but zero qualifying
positions records its whole pool as cap/capacity-unallocated.

### Worked audit example

For actual coin spending of 50,000 and bonus spending of 10,000 in the first
band, the funding balance is 40,000 and the 25% pool is 10,000 coins.
Assume enough qualifying capacity to distribute all 10,000:

| Audit field | Fully paid | Temporarily failed after paying 6,000 |
| --- | ---: | ---: |
| `coinsSpent` | 50,000 | 50,000 |
| `bonusSpent` | 10,000 | 10,000 |
| `fundingBalance` | 40,000 | 40,000 |
| `rewardPercentage` | 25 | 25 |
| `rewardPoolAmount` | 10,000 | 10,000 |
| `retainedBalance` | 30,000 | 30,000 |
| `coinsShareAmount` | 10,000 | 6,000 |
| `pendingAmount` | 0 | 4,000 |
| `unallocatedAmount` | 0 | 4,000 |
| `balanceAfterPayout` | 30,000 | 34,000 |
| `status` | COMPLETED | FAILED |
| `fullyAllocated` | true | false |

The pool-reservation balance and the actual-payout balance answer different
questions. Neither should be confused with gross spending, which includes bonus.

### Query a category and period

Use parameters for the category ID, year and month. Keep `mode` visible because
SINGLE and MULTI are independent settlements.

```sql
SELECT s.id, s."catId", c.name AS category, s.mode, s.year, s.month,
       s.status, s."policyVersion", s."coinsSpent", s."bonusSpent",
       s."grossSpent", s."bonusOffsetApplied", s."bonusOffsetShortfall",
       s."fundingBalance", s."qualifyingPercentage", s."rewardPercentage",
       s."rewardPoolAmount", s."distributableAmount", s."retainedBalance",
       s."coinsShareAmount" AS "paidCoins", s."pendingAmount",
       s."capUnallocatedAmount", s."unallocatedAmount", s."balanceAfterPayout",
       s."fullyAllocated", s."totalParticipants", s."rewardParticipants",
       s."processedParticipants", s."coinsRewardParticipants",
       s."minimumReward", s."maximumReward", s."rewardCap",
       s."startedAt", s."completedAt", s."lastError"
FROM "GameMonthRewardStat" s
JOIN "GameCategory" c ON c.id = s."catId"
WHERE s."catId" = $1 AND s.year = $2 AND s.month = $3
ORDER BY s.mode, s."createdAt";
```

### Category totals across modes

Only combine new-policy records with known financial fields. Group by category
and period; summing percentages across modes is not meaningful.

```sql
SELECT "catId", year, month,
       SUM("coinsSpent") AS "actualCoinsSpent",
       SUM("bonusSpent") AS "actualBonusSpent",
       SUM("fundingBalance") AS "availableAfterOffset",
       SUM("rewardPoolAmount") AS "totalRewardPool",
       SUM("coinsShareAmount") AS "paidCoins",
       SUM("retainedBalance") AS "balanceAfterPoolReserved",
       SUM("pendingAmount") AS "pendingCoins",
       SUM("unallocatedAmount") AS "unallocatedCoins",
       SUM("balanceAfterPayout") AS "balanceAfterActualPayout",
       BOOL_AND(status = 'COMPLETED' AND "fullyAllocated") AS "everythingAllocated"
FROM "GameMonthRewardStat"
WHERE year = $1 AND month = $2 AND "policyVersion" IS NOT NULL
GROUP BY "catId", year, month;
```

Investigate rows with `status = 'FAILED'`, nonzero `pendingAmount`, or completed
rows with nonzero `capUnallocatedAmount`. Every new payout transaction includes
its audit row ID in `metadata.auditId`, allowing recipient-level reconciliation:

```sql
SELECT "user_id", amount, status, "txnRef", metadata
FROM "Transaction"
WHERE category = 'GAME_MONTHLY_REWARD'
  AND metadata->>'auditId' = $1
ORDER BY "createdAt", id;
```

### Historical migration

Migration `20261019100000_monthly_reward_audit` removes the six obsolete top-coin
and bonus settlement columns. It first archives their amounts/counts/scores,
including the original ordinary-coin values, into `legacyBreakdown`.
Historical `coinsShareAmount`, coin recipient counts and coin score totals then
include both former coin groups. Historical bonus payments remain in the archive
and original transaction ledger; they are not relabelled as coin payments.

Deploy the schema migration and the updated API/worker together: old workers
reference columns that this migration removes. Existing rows receive
`LEGACY_COMPLETED`. Unknown funding percentages, pool
balances, allocation flags and new audit dates stay NULL rather than being
invented. Financial analytics should handle those rows separately. No historical
rows are deleted or repaid. A pre-audit incomplete plan is rejected for explicit
reconciliation rather than creating zero paid counters over existing payouts.

A missing snapshot for an incomplete plan, changed snapshot cardinality,
incomplete batch, unreconciled mixed spending, missing recipient wallet, invalid
amount, or curve-rounding failure stops settlement. Retry the existing job after
resolving the cause. Restore the **matching frozen snapshot** if necessary; do
not replace it with a changed current leaderboard or delete receipts to force a
new calculation. Some awards may already have committed, and receipts prevent
paying them again. Legacy partially paid periods need reconciliation before
switching policies; the completed-stat guard does not reconcile partial legacy
payments automatically.

## Verification

```bash
# Policy boundaries, endpoints, exact rounding, ordering and capacity cases
npx vitest run tests/unit/monthly-rewards.test.ts

# Database/Redis integration and wallet invariants, using disposable infrastructure
node scripts/test-infrastructure.cjs tests/integration/monthly-game-rewards.test.ts tests/integration/monthly-reward-audit-migration.test.ts tests/integration/wallet-integrity.test.ts

npm run test:typecheck
```

The integration tests exercise actual mixed spending, pending-charge exclusion,
the explicit bonus offset, coins-only settlement, recovery after a partial payout failure, concurrent retry,
frozen-plan reuse, missing-snapshot protection, partial audit progress, cap excess,
zero funding, no qualifying players, historical migration, notification uniqueness,
recipient-specific SSE visibility, subscribed-device push and completed-period replay.

See also [wallet integrity and rollout](wallet-integrity.md).
