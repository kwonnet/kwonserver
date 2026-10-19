# Monthly game coin rewards

Implemented policy: `monthly-90-v1`.

Monthly leaderboard rewards are paid in **coins only**. The reward pool uses
actual committed coin spending from PostgreSQL. Bonus spending is recorded for
reconciliation but neither funds the pool nor becomes a bonus payout.

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

| Category/mode participants | Qualifying percentage | Pool percentage of actual coin spending |
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
poolMinor = floor(actualCoinSpending × 100 × poolPercentage / 100)
```

Players outside the first `N` positions receive no monthly leaderboard reward.
The job skips absent/empty leaderboards and categories with zero qualifying
players. In particular, fewer than five participants produce zero winners.

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

The returned `coins` total **already excludes bonus debits**. Do not subtract
`bonus` again, divide it by an assumed conversion factor, or apply a fixed bonus
percentage. The earlier 15% discussion was an illustrative assumption only.

Example: actual coin debits of 1,200 and bonus debits of 800 produce a 300-coin
pool in the first band: `1,200 × 25%`. The bonus fraction happens to be 40% in
that example, but the job never needs an assumed fraction.

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
| Pool: 25% of actual coin spending | 743,750,000 coins |
| Affordable average | 74,375 coins |
| Normal minimum: 90% of average | 66,937.50 coins |
| First-place target: 5 × average | 371,875 coins |
| Individual ceiling | 500,000 coins |

The curve distributes the pool between these endpoints, with final cent rounding.
No player spending assumption is used. Individual points determine leaderboard
order; personal spending does not directly determine that player's award.

## Settlement, retries and audit

1. Skip a category/mode/month with an existing `GameMonthRewardStat`. This also
   protects periods completed under the previous reward policy.
2. Freeze the previous month's sorted set using Redis `COPY` without replacement.
   Snapshot key: `<monthly-ranking-key>:settlement:monthly-90-v1`.
3. Read actual spending, calculate the curve and save the plan through
   `walletOperation` scope `monthly-reward-plan`. The period key is
   `<catId>:<MODE>:<year>:<month>`.
4. On retry, use the persisted plan and frozen ranking. Original leaderboard
   changes and late ledger entries do not alter an existing plan.
5. Credit winners through `walletOperation` scope `monthly-reward`, with identity
   `<catId>:<MODE>:<year>:<month>:<playerId>:COINS`. Wallet credits, ledger entries,
   applicable monthly milestone achievements and receipts commit atomically.
6. After all awards complete, create statistics through the `monthly-reward-stat`
   receipt. A partial failure does not mark the period fully settled.
7. Retain an incomplete run's snapshot without expiry. After settlement, give the
   snapshot a seven-day inspection window; completed-period replay no longer
   needs it. PostgreSQL plan/payment receipts remain durable.

All payout transactions use source/currency `COINS`, credit `wallet.coins`, and
carry the period, category, mode and policy in metadata. No payout increments
`wallet.bonus`.

For compatibility, existing statistics fields remain in the schema:

- `coinsShareAmount` contains the complete distributed coin budget.
- `coinsRewardParticipants` contains all qualifying positions.
- `coinsParticipantsScore` and `rewardParticipantsScore` contain their score sum.
- `topCoinsShareAmount`, `bonusShareAmount`, their participant counts and score
  fields are zero; there are no longer separate top-coin or bonus settlement groups.
- `coinsSpent` and `bonusSpent` preserve the actual ledger split for audit.
- The plan retains the pool, capped budget, unallocated amount, endpoints,
  shape and rounding information.

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
node scripts/test-infrastructure.cjs tests/integration/monthly-game-rewards.test.ts tests/integration/wallet-integrity.test.ts

npm run test:typecheck
```

The integration tests exercise actual mixed spending, pending-charge exclusion,
coins-only settlement, recovery after a partial payout failure, concurrent retry,
frozen-plan reuse, missing-snapshot protection and completed-period replay.

See also [wallet integrity and rollout](wallet-integrity.md).
