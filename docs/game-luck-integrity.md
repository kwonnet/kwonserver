# Instant LuckySpin/LuckyFlip and integrity review

LuckySpin and LuckyFlip choose from the server-provided round options locally.
The wheel starts its 2.8-second animation immediately; a card reveals immediately.
Both submit at animation start, independently of the network acknowledgement.
A slow wallet/Redis response cannot freeze the animation or block another card.

The server binds the request to the authenticated account, joined room, catalog
mode/category, question ID and round ID. It uses its stored options, not a list
sent back by the client. Numeric selections are normalized to strings. Each
selection uses a UUID action identity; retries preserve identity **and value**.
The chosen value is part of the wallet-operation fingerprint, so changing the
value on an already-used identity cannot replace its previous accepted action.

For options `[10,17,0]`, `10`, `17` and `0` use the existing point multiplier and
latest-selection scoring rules. `40` is recorded as an invalid selection and
produces **zero points**, including no first-answer bonus. Later valid selections
cannot restore points for that user in that round. Other players and the normal
room flow continue. The normal game-action fee remains; this is not a coin refund.
Closed/replaced rounds still follow the existing rejection/refund rules.
LuckySpin retains its server cooldown and LuckyFlip its per-round card limit.
The legacy `spin` command still asks the server to choose for older clients.

This is membership validation, not proof of fair randomness. A modified client
could deliberately choose the highest allowed value. The new policy does not
retain the earlier server-RNG guarantee for locally selected outcomes.

## Evidence and queue

An invalid accepted request creates `GameIntegrityCase` in the **same PostgreSQL
transaction** as its wallet debit and `GameWalletAction`. The case ID is the
unique action ID, so retries cannot create duplicate evidence or charges.
No extra API/queue round trip is needed before animating.

Evidence includes account, game, category, mode, actual room partition, round,
question, submitted value, server-allowed options, zero awarded points, reason,
operation/socket IDs, observed socket address, bounded user-agent, and timestamps.
The address is the server-observed peer address; it may identify a reverse proxy.
We do not trust client-provided forwarded IP headers. `GameRoundRecord` retains
question/context/results; `GameWalletAction` provides delivery/refund status.
Cases are **suspicions for investigation**, not confirmed fraud findings.

`recover_game_integrity_cases` runs every minute in the existing background worker.
It claims up to 200 due cases with SKIP LOCKED, dispatches four at a time, and sends
only `{caseId}` to the BullMQ `game-integrity-review` queue. Job ID equals case ID;
there are five exponential-backoff attempts. Completed jobs retain pointers for
seven days, failed jobs for 30 days, each capped at 10,000. Evidence stays in SQL.
The watchdog retries pending cases after five minutes and replaces exhausted
failed queue jobs. Queue outages do not erase evidence or affect settled scores.

The worker has local/global concurrency two and idempotently moves PENDING cases
to AWAITING_REVIEW with `reviewReadyAt`. It prepares a durable human-review inbox;
it does not automatically ban users, reverse other winnings, or issue a verdict.
Reviewers can record `reviewedAt`, `resolution` and status after investigation.
Review access is through internal database/admin tooling; no public endpoint or
new dashboard screen is introduced. Retention and access must follow the app's
existing internal security-data controls.

```sql
SELECT c.id, c."userId", c."gameKind", c.mode, c."catId", c."roomId",
       c."roundId", c."questionId", c."submittedValue", c."allowedValues",
       c."awardedPoints", c."requestDetails", c.status, c."createdAt",
       c."queuedAt", c."reviewReadyAt", a.status AS action_status, a.reason
FROM "GameIntegrityCase" c
LEFT JOIN "GameWalletAction" a ON a.id=c.id
WHERE c.status IN ('PENDING','AWAITING_REVIEW')
ORDER BY c."createdAt" LIMIT 200;

SELECT "userId", COUNT(*) AS suspected_attempts, COUNT(DISTINCT "roundId") AS rounds
FROM "GameIntegrityCase" GROUP BY "userId" ORDER BY suspected_attempts DESC;
```

Deploy migration `20261019160000_game_integrity_cases`, regenerate Prisma, deploy
the server/background worker and matching web client. Existing integrity/ranking
and reward migrations still apply. No live database is modified by the tests.
