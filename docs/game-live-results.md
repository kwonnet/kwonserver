# Live game results and asynchronous settlement

## Why the last second and welcome were slow

The old room scheduler read `GameRoomRuntime` from PostgreSQL on every timer tick.
At round end it waited for snapshot validation, score/energy writes, ranking
projection, streak rewards, and one energy read per player before sending scores.
The welcome was sent at the end of a delayed room initializer after runtime setup.

The welcome now emits immediately after accepted membership and Socket.IO room
subscription, before runtime setup, counts, and the delayed roster initializer.
Authentication, catalog lookup and wallet/energy checks still happen before
membership is accepted. A connection cannot receive private room data before then.

## Live path

1. Normal countdown ticks read Redis room status, deadline, round ID and revision.
   Missing legacy phase caches fall back to PostgreSQL once. Phase changes still
   have durable PostgreSQL checkpoints; Redis is not the only recovery source.
2. At expiry, a Lua operation closes admission and freezes the question, answers,
   WordMaker entries, votes and accepted action IDs at one serialization point.
   The immutable copy is `game:round-snapshot:<roundId>`.
3. Scoring uses that server-owned snapshot without PostgreSQL reads. Score bounds
   are validated using the same validation as durable settlement.
4. `game:result:<roundId>` stores the frozen snapshot, room context and scores.
   The same Lua operation records streak order and inserts the round ID into
   `game:results:pending`. Pending snapshots/results do not expire before sync.
5. Redis rankings and counters use the existing atomic
   `game:round-projection:<roundId>` marker. Immediate and later worker retries
   share the marker and cannot increment the same round twice.
6. The room receives its results and Redis roster, then enters the next CHAT
   phase. PostgreSQL score/energy settlement does not block result publication.
   The configured category play durations are unchanged.

Live rankings may lead PostgreSQL while settlement is pending. They are not a
second source of wallet credits. Reward planning refuses to freeze a period with
pending durable rounds in its scope, so eventual score writes cannot silently
exclude a winner from monthly, weekly or yearly payouts.

## BullMQ worker and recovery

`game-round-results` has four local workers and a global concurrency limit of four.
Jobs use the round UUID as their ID, ten attempts and exponential backoff starting
at one second. Completed job retention is seven days (up to 10,000 jobs), and
failed job retention is thirty days (up to 10,000 jobs).

The worker confirms captured action receipts, persists the snapshot, and calls
the existing round-locked SQL settlement. Stats, energy and COMPLETED commit in
one transaction. Repeating a job reuses the completed receipt. Streak order was
captured on the live path; workers do not reorder consecutive room wins.

Energy refresh uses one batch query for the round instead of a query per player.
Energy and achievement events publish through `game:events:live`; each API replica
forwards only these allowed events to its local subscribed player sockets.
Delayed energy updates are sent only to sockets still playing that category.
Confirmed energy invalidates the Redis energy cache as before.

The minute recovery task dispatches pending Redis results, including failed jobs.
Queue publication failure does not discard a result or halt its live score.
After settlement, the pending entry is removed and result/snapshot retention is
seven days. Existing PostgreSQL action journals and stored question/context still
reconstruct unfinished rounds after a Redis loss; Redis AOF/persistence and an
appropriate non-evicting deployment remain necessary for uninterrupted live play.

## What still uses PostgreSQL

This release does **not** turn wallet debits into unchecked Redis-only balances.
Paid answer/chat/vote actions retain their existing ledger transaction and
idempotent delivery/refund flow. Refills and milestone wallet credits also remain
durable. New round creation and phase transitions retain PostgreSQL checkpoints.
The completed round enters CHAT immediately in Redis; its queued worker writes
the PostgreSQL CHAT checkpoint only while that same round still owns the runtime.
Moving these financial operations entirely into Redis requires a separate funded
reservation and reconciliation design; removing the ledger checks would risk
overspending or losing money on a Redis restart.

No schema migration or frontend change is needed. Deploy the API and background
worker from the same server image. The worker must have `RUN_BACKGROUND_JOBS=true`.

## Operations

- `ZCARD game:results:pending` shows unfinished live-to-durable settlements.
- `ZRANGE game:results:pending 0 9 WITHSCORES` shows retry scheduling; scores are
  Redis-clock millisecond timestamps, not game points.
- Inspect BullMQ `game-round-results` failures and `game_result_enqueue_failed` logs.
- Continue monitoring `GameRoundRecord` PENDING age and projection/effect flags.
- A growing backlog delays durable stats/energy and reward planning; provision
  database connections and worker capacity before increasing concurrency.
- Live result latency and durable sync latency are separate measurements. No
  fixed production latency is guaranteed by local tests.

Energy refills and round energy changes now share a versioned Redis authority;
see [Live game energy and refills](game-energy-refills.md). Round workers publish
current Redis energy rather than stale PostgreSQL snapshots, and no longer
invalidate energy after settlement.
