# Live game energy and refills

Game energy is category-specific and shared by single-player and multiplayer
rooms. It is separate from coins and bonus wallet balances.

## Request path

Joining a room loads `player:{playerId}:cat:{catId}:energy` from PostgreSQL only
when that Redis hash is missing or has no version. Initialization uses an atomic
insert and a Redis compare-and-initialize script, so concurrent joins cannot
replace a newer balance. The initial values remain 2,500 energy, 50% gauge and
50% turbo.

A warmed refill performs Redis reads and one Lua mutation; it does not wait for
PostgreSQL, wallet ledger transactions, or a background worker. The script:

- Uses the authenticated player's current category and a validated operation ID.
- Refills the selected meter by up to 10 percentage points, capped at 100%.
- Charges 10 energy per percentage point, constrained by available energy.
- Records the operation ID and its field atomically with the balance change.
- Increments a category energy version and marks the hash dirty for persistence.

Replaying an operation does not charge again. Reusing it for the other meter is
rejected. The server returns the current balance, which may include later valid
operations. The client ignores older versions and other-category energy events.
The UI waits for this Redis acknowledgement, not an optimistic client balance.
Network latency still affects response time; no production latency guarantee is
implied by removing database calls.

## Round updates and database persistence

Round energy gains (150–250) and gauge/turbo consumption (2–4 each) use the same
Redis mutation path, with an idempotency receipt per round and player. They are
applied by the existing background result processor. Completed rounds with an
unfinished projection are retried by durable round recovery. Leaving or changing
rooms no longer deletes energy hashes.

The result worker persists the affected players in batches of 100. Separately,
`sync_game_energy` runs every minute and drains up to 10,000 dirty category
balances per run, covering standalone refills when no round completes. Repeated
changes coalesce into one snapshot instead of creating one database write per
click. A backlog or database outage can extend the synchronization delay.

`GameEnergy.version` fences PostgreSQL snapshot writes: a snapshot updates a row
only when its version exceeds the stored version. Redis removes a dirty entry
only if that snapshot's version is still current. Consequently:

- An older worker cannot overwrite a newer database snapshot.
- A refill arriving during a database write remains pending for another sync.
- Database failures leave the pending entry intact for retry.
- Retrying a round cannot award energy twice.

## Deployment and operations

Apply the `20261019193000_game_energy_version` migration before deploying the
server, and restart API and background worker processes together. Keep the
recurring worker enabled; monitor failures of `sync_game_energy`, the count of
`game:energy:dirty`, and its oldest timestamp for persistence lag. The timestamp
uses first-dirty time so a frequently active account does not hide its lag.

Redis now holds unsynchronized energy and operation receipts. Use persistent,
non-evicting Redis, as required by live game result storage. Do not delete or
expire live energy hashes, pending entries or receipt keys as cache cleanup.
Receipts are retained to preserve retry idempotence. A complete Redis data loss
can lose energy changes not yet synchronized to PostgreSQL; this design does
not claim durability independent of Redis persistence. PostgreSQL remains the
fallback snapshot for cold initialization. Coins and bonus wallet accounting
retain their existing durable ledger path.
