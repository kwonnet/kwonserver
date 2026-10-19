# Game service reliability and Redis key upgrade

This change addresses the 16 findings in the October 19, 2026 game-service audit.
It changes game execution and ranking inputs, not the monthly payout formula or
fixed milestone reward amounts. Both `kwonserver` and `kwonweb2` must be deployed.

## Fixes

| Finding | Implemented behavior |
| --- | --- |
| Client-selected LuckySpin/LuckyFlip points | The UI selects and animates immediately. The wallet transaction validates the selection against the stored round options. An invalid selection scores zero for that player's entire round and creates durable evidence for review. See `game-luck-integrity.md` for this updated policy. |
| Exposed answer keys | All public questions use an explicit field whitelist. `answer` is blank, accepted alternatives and internal context stay private. Anagram receives a partial prefix hint. |
| Month-end leaderboard expiry | Version 2 period keys retain data for 120 days after writes. Reward snapshots remain independently frozen. Closed-period ranks can be rebuilt from PostgreSQL. |
| Weekly keys split at month/year boundaries | Weekly keys use the ISO week-year and week only. Migration merges the legacy pieces of a boundary-crossing week once. |
| Unawaited score persistence | A round's player stats, period stats, energy changes and completion receipt commit in one awaited PostgreSQL transaction. Redis projection is awaited and recoverable. |
| Category scores multiplied by player count | One atomic projection adds the sum of player scores once and increments category round count once. |
| Inputs deleted before scoring; duplicate scoring | Admission closes atomically with snapshot capture. Inputs remain until durable settlement. A locked unique round receipt prevents score and energy duplication. Scoped cleanup checks round ID and room generation. |
| Process-local timers | Room phase, deadline, generation and revision live in `GameRoomRuntime`. Redis schedules due rooms; another API process resumes them after a crash. |
| Missing cross-server game broadcasts | The `/games` namespace uses the Socket.IO Redis adapter. Questions, countdowns, scores and Swen broadcasts reach players on other API instances. Existing transient paid-chat delivery remains local per subscriber to avoid duplicate relays. |
| Profile-cache miss resets scores | Joining only refreshes profile/session/presence. It does not initialize or overwrite period scores. |
| Drifting countdown; second-only clock | Redis TIME with millisecond precision controls deadlines and admission. Countdown is recomputed from the persisted deadline; missed ticks do not extend a round. |
| Client energy replacement; lossy energy synchronization | PostgreSQL owns energy. A refill is an idempotent action with a server-calculated cost, amount and bounds. Cached balances never overwrite PostgreSQL. Round energy updates share the score transaction. |
| Truncated solo IDs, fixed capacity, unsupported modes | Solo room partitions use the full account ID; multiplayer partition allocation uses catalog capacity; join validates the game's supported modes. |
| Joining creates reward participants | A join never inserts a leaderboard member. Scoring an accepted answer creates a participant, including a genuine zero-score answer. Migration removes legacy zero-score members without evidence of play. |
| Global cleanup scans and starving recovery | Round cleanup uses its question/answer/action manifest, not a database-wide SCAN. Terminal action acknowledgements expire after seven days; pending ones do not. Recovery claims 200 due actions with SKIP LOCKED, processes eight concurrently, and backs off individual failures. Ranking discovery follows every SCAN cursor with COUNT 250. |
| LuckyWhiz negative index and invalid rebuild | Random indexing cannot produce -1. Manual repair uses period-specific durable stats. Monthly totals never populate a daily or weekly ranking. Monthly archival ranks PostgreSQL rows without deleting input leaderboards. |

## Periods and storage

All boundaries are UTC, independently of the API process's local timezone.
For a category and mode, examples are:

```text
ranking:v2:cat:<category>:mode:multi:month:2026-10
ranking:v2:cat:<category>:mode:multi:week:2026-W53
ranking:v2:cat:<category>:mode:multi:day:2027-01-01
ranking:v2:cat:<category>:mode:multi:month:2026-10:stat
player:v2:<user>:cat:<category>:mode:multi:month:2026-10
player:<user>:cat:<category>:mode:multi:profile
```

`2026-W53` includes January 1, 2027. The round's recorded `playedAt` determines
all score periods, even when settlement/recovery happens after midnight.
Energy remains shared across modes within a category, as before.

New durable records:

- `GameRoundRecord`: immutable question/context, room generation, played time,
  captured answers, computed scores, completion and pending-projection/effect flags.
- `GameRoomRuntime`: room configuration, current phase/deadline/round, generation,
  active flag and revision.
- `GamePeriodStat`: per-player UTC daily and ISO weekly totals. Existing
  `GameMonthStat` remains the monthly source.
- `GameWalletAction.sequence`: durable ordering for latest-spin replacement.
  `nextAttemptAt` and `failures` support fair, concurrent recovery.
- `GameEnergy` has one row per account/category. Migration collapses duplicate
  rows by retaining the greatest existing field values, without adding duplicate
  balances together, and clamps gauge/turbo to 0–100.

## Round execution and recovery

The normal flow is CHAT → PLAY → VOTE (Acronym only) → settlement → CHAT.
A deadline is absolute. Each scheduler pass claims at most 100 due rooms;
processing concurrency is eight per API process. A room lease lasts 15 seconds,
renews every four seconds, and is released only by its owning token. Room
generation and phase revisions fence superseded work. Scheduler ticks run every
500 ms, and normal room updates are due approximately once per second.

Capturing a round closes Redis admission and freezes the accepted inputs at the
same serialization point. PostgreSQL confirms captured action receipts and
stores the snapshot before scoring. A refund cannot race a captured action into
both credited score and refunded payment: refund handling locks the action row;
conflicting input is left for durable reconciliation rather than scored blindly.

Scoring locks the round row. Monthly/daily/weekly stats and energy commit with
its COMPLETED status. Concurrent retries read the completed result. Redis updates
and their projection marker are atomic; a failure after the database commit
leaves `projectionPending` for recovery. Cleanup follows settlement and never
scans unrelated rooms.

The existing recurring worker runs `recover_game_rounds` every minute. It
reconciles pending rounds older than two minutes, reconstructing missing inputs
from DELIVERED wallet actions in sequence order. Latest answers, WordMaker
guesses and vote replacements follow their existing scoring rules. It also
retries completed rounds with pending Redis projections. Pending wallet actions
continue through `recover_game_wallet_actions`; definite rejection refunds them,
whereas a network timeout leaves them pending for a safe retry.

API startup restores the scheduler from active PostgreSQL runtime rows. A
missing individual question key can be restored from its round record. If all
Redis presence is lost, players reconnect/rejoin; durable accepted actions can
still be scored. Historical live chat is intentionally not replayed. Existing
winning-streak effects remain idempotent while the room exists; a complete loss
of Redis streak history cannot recreate the previous streak sequence. Financial
score recovery does not invent that history.

The UI fences delayed responses when the round changes or the component unmounts.
New clients select locally, start the wheel/card animation immediately, and submit
that selection at animation start without awaiting the acknowledgement. Retries
reuse the same identity and selected value. LuckySpin retains its server cooldown;
LuckyFlip limits accepted flips to the number of cards. Valid choices follow the
existing score multiplier and latest-outcome rule. Invalid choices permanently
zero that user's accepted round and create `GameIntegrityCase` evidence.
Legacy clients submitting the `spin` command retain server-selected outcomes.

Membership validation alone cannot establish random selection: a modified client
can select the largest allowed value. This policy deliberately prioritizes instant
local animation with range validation; it does not provide the previous server RNG
guarantee for new clients.

## Deployment and legacy migration

Do not run old and new game writers concurrently: they use different leaderboard
keys and luck/energy protocols.

1. Back up PostgreSQL and Redis. Drain game traffic and let current rounds finish.
   Stop old API game writers and reward/recurring workers. Confirm no legacy
   process can write rankings during the copy.
2. Build the new server and apply migrations using the normal deployment process.
   The new migration is `20261019140000_durable_game_rounds`.
3. While writers and reward workers remain stopped, run:

   ```sh
   npm run games:repair-rankings -- --writers-stopped
   ```

   This explicitly repairs the current/previous month, current/previous ISO week,
   and current day for every configured category/mode. It logs category progress.
   With no legacy source, it also rebuilds current canonical caches from durable
   stats; run it with writers stopped when repairing a partial/full Redis loss.
   Legacy source copies are immutable, batches contain 500 players, and durable
   per-batch receipts plus Redis offsets make retries resumable. A large source
   continues across bounded migration passes automatically. Rerun after fixing
   any reported data problem; do not delete progress or payment receipts.
4. Deploy the matching web client, start the new API and workers, and reconnect
   game clients. Unlisted luck values cannot earn points; old energy
   replacement payloads are rejected. They must reload to use the new protocol.
5. Check pending rounds, Redis projections, runtime lag and existing reward job
   status before reopening normal game traffic.

Closed periods with durable round records and without legacy sources are rebuilt
from durable totals even if a
partial Redis ranking already exists. Profiles and per-player play counts are
hydrated with the rankings, so users need not rejoin to appear correctly.

Monthly and weekly reward planning also invoke period repair before freezing
new rankings. Already-frozen reward plans are not rewritten. Weekly payout locks and honors
receipt aliases from both old and new ranking key formats, including weeks
spanning two months/years, to prevent duplicate credits during the key upgrade. Legacy zero-score
participants are retained only with player play-count or delivered-answer
evidence. Missing monthly cache can use `GameMonthStat`; daily/weekly recovery
uses `GamePeriodStat`. If accepted paid actions exist but no recoverable ranking
exists, planning fails for reconciliation instead of treating the category as
empty. Data already lost by an old expiry or unawaited write is not fabricated.

The adapter is limited to `/games`; messaging keeps its existing encrypted relay.
Every API replica must use the same Redis service. If HTTP long-polling is enabled
in the deployment, configure load-balancer session affinity as required by
Socket.IO. Persistent Redis and PostgreSQL backups remain necessary. Do not
selectively delete projection markers while retaining their score projections.

## Operations

```sql
SELECT status, "projectionPending", "effectsPending", COUNT(*) AS rounds,
       MIN("playedAt") AS oldest_round
FROM "GameRoundRecord"
GROUP BY status, "projectionPending", "effectsPending";

SELECT id, "roomId", "catId", mode, "playedAt", status,
       "projectionPending", "effectsPending", "updatedAt"
FROM "GameRoundRecord"
WHERE status = 'PENDING' OR "projectionPending"
ORDER BY "playedAt" LIMIT 100;

SELECT phase, COUNT(*) AS rooms, MIN(deadline) AS oldest_deadline
FROM "GameRoomRuntime" WHERE active GROUP BY phase;

SELECT status, COUNT(*) AS actions, MAX(failures) AS max_failures,
       MIN("nextAttemptAt") AS next_attempt
FROM "GameWalletAction" GROUP BY status;
```

Monitor old PENDING rounds, overdue active runtimes, pending projections,
per-action failure counts and reward plan failures. Completed orphan rounds may
retain `effectsPending` for live-room presentation/streak reconciliation; that
flag does not mean their committed score is missing. Retain round/action receipts
for audit and recovery; archive them under a separate retention policy rather
than deleting active/pending rows.

These concurrency limits are bounded defaults, not a throughput guarantee.
Measure scheduler deadline lag and database latency at the actual occupied-room
count before increasing replicas or concurrency. The SQL, Lua and cross-replica
integration tests validate correctness, not production capacity at millions of
simultaneous players.
