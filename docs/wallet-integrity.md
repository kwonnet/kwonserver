# Wallet integrity and rollout

PostgreSQL is now the authoritative wallet store. Game deductions, transfers,
purchases and rewards commit their balance change and ledger entries together.
The old Redis-to-wallet sync functions deliberately do nothing. Cache invalidation
cannot authorize, reverse, or overwrite a payment.

## Fixes in this change

- Wallet row locks serialize competing spenders; transfer locks use sorted user IDs.
- WalletOperation receipts serialize retries with transaction-scoped advisory locks.
  Reusing a key with a different payload returns 409. Receipts and balances commit
  together, and failed transactions leave neither. Keep these receipts indefinitely.
- Finite, positive amounts and at most two decimal places are required. Calculations
  use integer hundredths at the service boundary. New database writes reject negative
  or non-finite wallet balances and transaction amounts.
- Game charges spend bonus first, use the actual selected price for affordability,
  and record the coin/bonus split durably. Answer/vote retries have server-derived
  operation identities. Stale question IDs and invalid vote targets are rejected
  before charging. Game/category labels used for pricing come from the joined catalog,
  not the client payload. PostgreSQL now supplies monthly spend totals.
- Flutterwave must report `successful`, matching transaction ID/reference, supported
  actual currency and sufficient actual amount. Package quantities and subscription
  prices come from the catalog. Caller-supplied gateway metadata is not proof of
  payment; unverified token/external purchase requests are rejected. Verified
  callbacks use the provider transaction ID for a durable receipt.
- Daily bonus eligibility uses server time under the wallet lock. Task claims cannot
  pay twice concurrently. Registration/referral bonuses now have ledger entries.
- Weekly/monthly/yearly payouts have period/recipient receipts. Weekly payouts are
  awaited, COINS rewards update `coins`, and annual queries use the intended year/mode.
- Subscription renewal checks eligibility and expiry again inside the transaction.
  Billing-period queue IDs avoid removing an active job; upcoming/overdue wallet
  subscriptions are reconciled from PostgreSQL if Redis scheduling was lost.
- Tips verify the authenticated sender and post owner; debit/credit records share a
  reference and identify their owners. New pending tips settle after their existing
  three-day hold, atomically with the ledger, once only. Historical pending tips are
  excluded from automation until reviewed (`settlementVersion: 1` marks new tips).
- Legacy Redis transaction import uses deterministic IDs, recognizes previously
  imported references, and removes only exact committed members. Equal timestamps
  no longer cause unprocessed records to be deleted.

## Required production cutover

This changes the source of truth. **Do not push this change into the automatic
production deployment until the existing Redis balances have been reconciled.**
A database migration alone cannot determine whether an old snapshot is correct.

1. Test this release against a staging copy first. Back up PostgreSQL and Redis.
2. Pause ALL old wallet writers: API/game sockets, workers, any remaining Cloud Run
   revisions, other VMs and kwonrec processes if they write wallet data. Keep the old
   code stopped during reconciliation and deployment; do not mix old/new versions.
3. With the correct production environment loaded in a trusted shell, run the
   read-only export from this checkout:

   ```bash
   npm run wallet:audit -- /secure/path/wallet-before-cutover.ndjson
   ```

   The file is created with owner-only permissions and must not be committed. It
   exports PostgreSQL/Redis balance differences, exact legacy transaction members
   and pending tips. Run only while writers are paused: the two stores cannot supply
   a joint atomic snapshot. A failed/partial export is not an approved report.
4. Review differences against payment confirmations, ledger records and the Redis
   backlog. Apply reviewed corrective entries with supporting evidence. Do not
   bulk-copy a Redis snapshot over PostgreSQL or blindly apply every legacy debit:
   some may already be included in the old periodic snapshot sync. Historical mixed
   coin/bonus charges without splits block the affected monthly reward calculation
   until reviewed. Verify prior payouts before rerunning pre-cutover reward periods.
5. Run the new `prisma migrate deploy` and deploy API and worker together. The normal
   deployment runs migrations; no manual `db push` or reset is needed. The migration
   adds receipts, the game-action outbox and exact Decimal money columns.
   The decimal migration aborts on negative/non-finite/out-of-range values or amounts
   needing substantive rounding. Reconcile those exceptions first; it tolerates only
   tiny historical floating-point noise (up to 0.0000001 currency units).
   Deploy the updated kwonweb alongside the backend: old clients without request
   identities/round IDs fail closed. PostgreSQL column conversion takes table locks;
   allow a maintenance window based on a staging migration of production-size data.
6. Exercise one transfer, coin purchase, retry, daily claim, game action and tip in
   staging; inspect balances and corresponding ledger entries. Confirm pending-tip
   and subscription jobs are registered. Resume production traffic and monitor.
7. After reconciling historical exceptions, explicitly validate the checks:

   ```sql
   ALTER TABLE "Wallet" VALIDATE CONSTRAINT "Wallet_nonnegative_finite";
   ALTER TABLE "Transaction" VALIDATE CONSTRAINT "Transaction_nonnegative_finite";
   ```

Do not roll back to an old Redis-authoritative application after new wallet writes.
Restore/reconcile both stores together if a rollback is necessary.

## Client retry contract

An `Idempotency-Key` header (8–128 letters, numbers, `_ . : -`) is **required**
for transfers, admin funding, wallet coin purchases, wallet subscriptions and post
tips. Missing keys return 400 before a debit. Reusing a key with a different payload
returns 409.

kwonweb automatically generates and retains a key in sessionStorage for the same
account, route and canonical request body. Network failures, reloads and auth retries
reuse it; a successful response releases it for the next intentional purchase.
Storage failures prevent an untracked charge. Other clients must implement the same
contract. Do not clear browser storage or switch tabs/devices to retry an uncertain
payment: inspect the original transaction first. Reload the authoritative wallet
after mutations; replay receipts describe the original operation, not later activity.

Provider callbacks and scheduled rewards use server-derived identities. Game
answers and votes include a server round ID; server-derived operation IDs deduplicate
retries within that round. Paid chat requires a stable client message ID.

## Exact money and game recovery

Money columns use PostgreSQL NUMERIC(20,2), exposed as Prisma Decimal. Services
validate amounts and calculate bounded integer hundredths; HTTP/socket serialization
preserves the existing numeric API shape. No external payment can use a NaN,
negative amount or fractional cent to bypass validation.

A game debit, ledger entry and GameWalletAction PENDING row commit together.
Delivery atomically writes the Redis effect and its acknowledgement with Lua.
A crash before delivery leaves work for the recurring recovery job; a lost response
replays the acknowledgement. Closed rounds, expired messages and rejected actions
receive one PostgreSQL refund preserving the original coin/bonus split. A timeout
is never evidence that an action failed. Only DELIVERED outbox charges contribute
to new monthly game spending totals. Paid chat history is polled by the browser to
recover a missed broadcast.

Run the API and worker together. The worker registers `recover_game_wallet_actions`
every minute. Monitor the count and age of PENDING GameWalletAction records and
failed recovery jobs; long outages delay recovery. Delivered means accepted into
game state, not that the user won or scoring completed.

Redis acknowledgements (`wallet-action:*`) must be retained. Configure durable
Redis persistence/backups and **noeviction**, with capacity monitoring. They are not
ordinary disposable cache entries. Do not flush this database or delete receipts.
Redis data loss or a restore that rolls back acknowledgements while PostgreSQL
retains newer actions requires pausing recovery and reconciling the two stores;
ordinary process crashes and ambiguous network responses are handled automatically.

## Remaining limits and business decisions

This is a targeted correctness audit, not proof of 100% reliability or a financial
certification. No production balances were inspected or repaired by this change.

- Historical opening balances and old unrecorded rewards mean a naive sum of all
  transactions is not a reconciliation.
- Legacy pending tips, historical duplicate payouts and balance differences need
  human reconciliation. They are not silently credited or deleted by migration.
- Ad-view and external task completion proof is not provided by this repository;
  cooldown/code checks do not prove a user watched an ad or completed an external
  action. A provider-signed completion webhook is needed for that policy.
- Existing economics are preserved: 50% coin-transfer fee; tip conversion/45% fee;
  randomized game charges and monthly reward allocation. Confirm these deliberately.
- Provider verification compares the current catalog. A changed/deleted package
  between checkout and callback needs support review; durable checkout price snapshots
  and refund/chargeback accounting are separate work.
- A VM/database outage can still make requests unavailable. PostgreSQL backups,
  restore drills, alerts on failed jobs and provider-to-ledger reconciliation remain
  operational requirements. Do not delete failed jobs or operation receipts to retry.
