# Account levels and benefits

PostgreSQL `AccountLevelBenefit` is the source of truth. Rates are integer basis
points (100 = 1%). Policies are seeded for levels 0–3:

| Level | Post tips share | Account gifts share | Chat gifts share | Quiz fee | Characters | Impressions / 24h | Game boost |
|---|---|---|---|---|---|---|---|
| 0 | 30% | 35% | 35% | 20% | 280 | 150 | 0% |
| 1 | 40% | 45% | 45% | 17.5% | 25,000 | 300 | 5% |
| 2 | 45% | 48% | 48% | 15% | 25,000 | 450 | 10% |
| 3 | 50% | 50% | 50% | 12.5% | 25,000 | 600 | 15% |

`SubscriptionPlan.level` references levels 1–3. Starter/Standard map to level 1,
Premium to level 2, Supreme/Pro to level 3. Government has two plans: Standard
maps to 1 and Pro to 3. Billing cycle, country pricing and seat tiers do not
change the parent plan's level. Existing plan assignments are backfilled by the
migration; unknown historical plan names conservatively map to level 1 and can
be reassigned explicitly.

## Eligibility and API

`getAccountBenefits(userId, transaction?)` resolves the currently primary ACTIVE
subscription with `startDate <= now < endDate`. Multiple legacy candidates are
resolved deterministically by end date descending then ID ascending. No eligible
subscription means level 0; TRIAL, PAUSED, EXPIRED, REVIEW and PAYMENT_ERROR do
not grant paid benefits. Stopping renewal on a currently paid subscription keeps
it ACTIVE until its end date. Administrative cancellation/revocation still
removes access immediately. Expiry is checked on reads, not just a cron job.

Authenticated `GET /subscriptions/benefits` returns the caller's policy, level,
version and subscription validity. `GET /wallets/transaction-rates` returns that
same account's `quizFee` fraction plus `accountBenefits`; responses are private
and not HTTP-cacheable. Plan catalogs include their level and benefit policy.
Authenticated/public profile composition derives `meta.level` from eligible
subscription data; it no longer hardcodes level 1.

Financial writes resolve policy within their existing ledger transaction, not
from JWTs, client input or the Redis join cache. There is no stale global policy
cache. Database errors fail the operation before an unpriced credit/debit.

## Tips, gifts and quizzes

The rates above are the RECIPIENT'S share. For a 100-coin post tip to level 0,
the recipient receives 30 and the platform retains 70. For a profile gift to
level 0, those values are 35 and 65. The recipient's level controls these rates,
not the sender's. The platform fee is the remaining share, rounded up to the
smallest coin unit, and the recipient receives the remainder, so the two always
sum to the original amount.

Post/profile gift transactions record account level, policy version, recipient
share basis points, gross coins, recipient coins and platform fees. Idempotent
retries return the original operation rather than repricing it. Chat gift rates
are stored and exposed, but there is no existing chat-gift payment endpoint to
modify; this release does not invent a separate gifting protocol.

A quiz fee is charged ON TOP of its reward pool using the CREATOR'S level.
A 1,000-coin pool costs 1,200 / 1,175 / 1,150 / 1,125 at levels 0–3. The API
still requires confirmation of the current fee. Quiz funding stores the applied
rate, fee and policy metadata; rewards and refunds use the funded snapshot.
`ChargeRate.tipFee` and `ChargeRate.quizFee` are removed. Historical transaction
metadata and already-funded quiz rates remain untouched.

## Posts and exposure

Server create/root-thread, quote and reply paths enforce the limit using
`Intl.Segmenter` grapheme counts, matching the composer counter. Emojis, flags,
skin-tone variants and joined emoji sequences count as displayed characters;
spaces and newlines count too. Every thread entry is checked independently.
Draft saves use the same limits. The existing composer/edit flow cannot bypass
the server limit; this change does not add an otherwise unavailable edit endpoint.

Publication snapshots the level's impression target and version in `PostBoost`.
The existing eligible public-root-post distribution and visibility checks apply.
Organic and promoted validated impressions both count toward the SAME target.
Repeat impressions count subject to the existing 150-second viewer cooldown;
refresh spam is not counted as additional exposure. The publication window is
24 hours, not an additional target on top of organic reach. Delivery is a target,
not a guarantee, and edits do not restart an existing exposure window.
Existing boost records keep their previous target/window; new publications use
the new policy. `SubscriptionPlan.postBoostTarget` is removed to avoid competing
sources of truth.

## Game rounds

Joining preloads account benefits into the player's private response and a
60-second Redis join snapshot. Public ranking hashes hold only the account
level, never private subscription IDs. The join snapshot does not authorize a
financial operation or score boost.

The first paid ANSWER/ACRONYM/WORDMAKER action resolves current policy in its
existing wallet transaction and saves it in the durable action payload. Later
accepted actions in that round reuse that snapshot, even after an upgrade or
expiry. Per-user wallet locks serialize competing first actions. Refunds exclude
rejected actions from selection. Delivery/recovery copies the server-authored
policy into the Redis answer, so result calculation makes no benefit database
calls. Old admitted answers without a policy retain level-0 scoring.

The full base score (including existing round bonuses) is computed and validated
first. If it is positive, final points are:

```
ceil(baseScore * (10_000 + gamePointBoostBps) / 10_000)
```

Integer arithmetic avoids floating-point rounding errors. Zero and negative
scores stay unchanged. Thus 10 points become 10/11/11/12 at levels 0–3, while
1 point becomes 1/2/2/2. A zero-point invalid luck submission stays zero. Lucky
outcome membership is checked before boosting. Each new spin starts from its
accepted base outcome; it never compounds an earlier boost.

Results are sorted AFTER boosting, and final scores feed existing rankings,
streaks and reward qualification. Results retain base score, boost points, level,
policy version and applied basis points. Idempotent round settlement reuses the
saved result; it does not recalculate against today's subscription.

## Policy updates and deployment

A database trigger automatically increments the policy version when benefit
values change. Existing financial/round/exposure snapshots are not rewritten.
Seed re-runs insert missing defaults and preserve existing policy configuration.

Apply `20261020100000_account_level_benefits` before deploying the new server;
regenerate Prisma and restart API/background workers together. Deploy kwonweb2
for dynamic counters and plan benefit displays. Coordinate the release because
the old server still expects the removed ChargeRate/plan columns. No wallet
balances or historical awards are modified by the migration.
