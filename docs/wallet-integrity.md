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
  reference and identify their owners. New gifts immediately credit 50% in coins to the recipient,
  atomically with the ledger, once only. The credit retirement migration expires
  historical pending legacy tips without converting their value.
- Legacy Redis transaction import uses deterministic IDs, recognizes previously
  imported references, and removes only exact committed members. Equal timestamps
  no longer cause unprocessed records to be deleted.

## Monthly leaderboard reward policy

Monthly category/mode rewards now offset actual bonus spending against actual
coin spending before tier-based funding, with
a protected minimum and a 500,000-coin ceiling. All qualifying awards settle in
coins; bonus spending is preserved for audit and deducted for funding. See [monthly game rewards](monthly-game-rewards.md)
for the formulas, qualification bands, rounding, snapshots, retry handling and tests.

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
- Historical duplicate payouts and balance differences need human reconciliation.
  Retired pending tip rewards are discarded by the authorized credit migration.
- Ad-view and external task completion proof is not provided by this repository;
  cooldown/code checks do not prove a user watched an ad or completed an external
  action. A provider-signed completion webhook is needed for that policy.
- Current economics: 50% coin-transfer fee; 50% gift platform share;
  randomized game charges and monthly reward allocation. Confirm these deliberately.
- Provider verification compares the current catalog. A changed/deleted package
  between checkout and callback needs support review; durable checkout price snapshots
  and refund/chargeback accounting are separate work.
- A VM/database outage can still make requests unavailable. PostgreSQL backups,
  restore drills, alerts on failed jobs and provider-to-ledger reconciliation remain
  operational requirements. Do not delete failed jobs or operation receipts to retry.

## Withdrawal authorization and review

Apply migration `20261014040000_withdrawal_security` before deploying the new API
and worker. The existing `AUTH_EMAIL_TOKEN_SECRET` must contain at least 32
characters; SMTP and the durable email worker must be configured. No email OTP is
returned by the API or stored in plaintext. Authorization codes expire after ten
minutes, permit five guesses, and are limited to one send per minute and five per
hour per user. The code is bound to the user, registered email and immutable
withdrawal quote. A changed email or password invalidates authorization.

`ChargeRate` defaults to a USD 5,000 / NGN 5,000,000 maximum **net payout per
transaction**, with inclusive approval thresholds of USD 2,500 / NGN 2,500,000.
Verified email, active account, unlocked wallet, sufficient coins and withdrawal
restrictions are checked on the server. Admins can pause payouts platform-wide or
restrict a user, with reasons retained in `WithdrawalAdminEvent`. Before financial
writes, adapters check authorization again as well as available provider funding.
Already submitted transfers continue reconciliation during a pause.

The `/dashboard/withdrawal-requests` screen is restricted to current ADMIN/SUPER users.
It shows the destination, wallet balances, paginated ledger history, earnings by
source and decision audit. Review requests reserve coins without sending funds.
A reviewer cannot decide their own withdrawal. Approval allows the worker to
proceed; rejection atomically restores the reservation once. Only unsubmitted
`PREPARED` requests can be rejected, including expired worker leases. Processing
attempt fencing prevents an expired worker from overwriting that decision. Never
restore coins merely because a provider response is missing or a payout is old.

The user authorizes a fixed net fiat payout and destination. The authorization
intent lasts fifteen minutes; provider conversion quotes may expire sooner and
are refreshed before dispatch, including after admin approval. Crypto receive
amounts shown before dispatch are estimates; the fiat amount stays fixed and
Kwonnet covers provider fees. The Wallet Withdrawals tab lists approval, blocked,
processing, review, completed and restored requests with timestamps.

### Bachs platform capability projection

`prepareBachsWithdrawal` does not require
`platform.capabilities.connect.status === "active"` from `GET /accounts/me`.
The platform response can contain `capabilities: null` alongside
`enabled_capabilities`. Preparation requires `enabled_capabilities` to be an array
containing `payouts`; missing, malformed or payout-disabled lists stop before
recipient setup. The optional nested capability object is not used for this check. Bachs' [payout overview](https://docs.bachs.io/guides/payouts/overview)
requires payout readiness on the account being debited and a usable destination;
Connect concerns creating/managing connected accounts, as described in
[Become a platform](https://docs.bachs.io/connect/become-a-platform).

Kwonnet still uses the connected-recipient flow: create/reuse the user's account,
verify its active `transfers` and `payouts` capabilities and destination usability,
fund it, then submit its payout with `X-Account-Id`. Removing the local platform
projection check does not bypass Bachs permissions; actual account-creation,
transfer and payout API denials still stop processing. A platform's enabled
`payouts` capability alone does not prove it may create connected accounts.

The [Create Payout reference](https://docs.bachs.io/api-reference/payouts/create-payout)
continues to govern request bodies: a registered destination plus exactly one of
`amount` (same currency) or `quote_id` (converted payout), with a stable
`Idempotency-Key` and the recipient account header. Existing coin reservation,
OTP/admin approval, fee/balance checks and reconciliation remain in effect.

Bachs bank-recipient onboarding uses the bank-resolved account-holder name rather
than requiring a multi-word public profile name. For crypto recipients, complete
profile names can be supplied to Bachs; a single-word display name is not locally
rejected or turned into a fabricated surname. Existing Bachs identity and capability
checks remain authoritative, and new recipients may still need provider onboarding.

The withdrawal form retains the selected provider across feedback, retries, token
renewal and settings refreshes. If that provider becomes unavailable, the form
keeps the selection and disables submission instead of switching to a different
provider. Settings reloads do not discard an in-flight operation or leave the form
stuck busy. Its bank list is reloaded for that provider; a stale
request cannot replace a more recent provider's bank list. The minimum withdrawal
and expected receive amount share a two-column summary row.


### Bachs recipient reuse and withdrawal diagnostics

Withdrawal preparation fetches the saved recipient's current account status.
When both `transfers` and `payouts` are active, it skips onboarding and reuses the
matching saved destination. A different destination is registered on that account
without resending its identity. An approved matching bank destination also avoids
a repeated bank-network name resolution. Account ID and destination usability
checks still run before coin reservation.

Inactive recipients submit minimal name/destination information when needed,
then re-read capabilities. If all outstanding requirement entries are already
under review or pending verification, preparation stops without resubmission.
Provider approval remains authoritative; this does not bypass Connect requirements.

Withdrawal diagnostics now use sanitized structured lifecycle events through the
normal logger. The temporary `bachs_withdrawal_response_raw` event has been removed.
No full provider response bodies or headers are logged.

Each operation emits `<step>.started`, then `<step>.completed` or `<step>.failed`
with elapsed milliseconds. Coverage includes quote preparation/persistence,
OTP email outbox/enqueue and verification, confirmation, processing leases,
dispatch eligibility, provider quote refresh, stage persistence, provider outcome,
settlement (including failed-withdrawal coin restoration), scheduled reconciliation,
and admin approval/rejection (including rejected-withdrawal restoration).
Both Bachs and Flutterwave provider preparation, bank verification, balance checks,
HTTP calls and dispatch use the same diagnostics. Bachs also records recipient
reuse/setup, onboarding/review, destination lookup/reuse, funding and recovery.

An async-local context carries the withdrawal ID and gateway into nested provider
calls, including background processing, without mixing concurrent withdrawals.
HTTP request IDs are added by the existing request logger; provider request IDs
are retained for support. Only an explicit allowlist of operational fields is
accepted: internal identifiers, endpoint path without query parameters, method,
HTTP status, stage, attempt, outcome, destination type, page offset and duration.
Bank details, wallet addresses, names, email addresses, OTPs, review notes,
request/response bodies, authorization headers and credentials are excluded.
Numeric HTTP statuses (100–599) remain visible through the sanitizer; OTP and
other sensitive code fields remain redacted.

A step's `completed` means that function returned successfully, not necessarily
that a payout reached the bank. Use `provider.outcome` and `settlement.completed`
to distinguish pending, successful and failed payouts. Confirmation/settlement
completion events occur after their database operations return, and retries can
repeat lifecycle events without creating a second wallet debit/refund. Existing
financial records remain the audit authority; diagnostic logs are not receipts.


Bachs destination-list responses use `{ destinations, total, limit, offset }`.
Withdrawal preparation reads `destinations` and follows offset pagination only
until it finds an exact match or exhausts the list for that recipient account.
It does not list other users' destinations. Malformed/incomplete pages stop
preparation rather than being treated as an empty list and creating duplicates.
Tests use this provider response shape, including destination reuse on later pages.


### Withdrawal methods and pricing

Nigerian accounts can select bank transfer or crypto. Accounts outside Nigeria
can select crypto only; bank eligibility is enforced by the server. Settings now
include separate `methods.bank` (NGN, Nigerians only) and `methods.crypto` (USD,
all eligible users) pricing, and supported crypto routes for every country.
Legacy top-level pricing fields retain the account's default method.

NGN bank payouts use `ngnPrice`, `ngnFee`, Nigerian minimum/maximum and review
threshold. Every crypto payout, including those requested by Nigerian users,
uses global `price`, `fee`, USD minimum/maximum and review threshold. The quote
stores that currency and pricing; confirmation, dispatch and admin approval use
the stored payout currency for their financial policy checks. The account's
country is still snapshotted and rechecked independently. Switching methods on
the client invalidates the quote, ownership confirmation and bank verification.

### Withdrawal confirmation email

Withdrawal OTP delivery uses `templates/email/withdrawal-code.mjml` with subject
`Kwonnet withdrawal confirmation code`. The responsive template includes the
configured public HTTPS `APP_LOGO`, a selectable six-digit confirmation code,
the actual code expiry in UTC, payout estimate, coins, provider, destination and
withdrawal reference. Bank account numbers are masked to their last four digits;
crypto addresses remain visible so the recipient can verify the intended wallet.
Crypto amounts are identified as estimates. The wallet link never contains the
code. All template values are HTML-escaped, and a plain-text alternative remains
available. Existing encrypted token storage, intent binding, cancellation,
outbox retries and SMTP delivery diagnostics are unchanged.

### Flutterwave stablecoin funding

Flutterwave crypto plans prefer the selected stablecoin wallet: USDT uses
`debit_currency: USDT`, USDC uses USDC, and RLUSD uses RLUSD. Kwonnet grosses up
the native transfer amount to cover fees deducted from that transfer. If the
matching wallet is absent or its available balance cannot cover the gross amount,
preparation falls back to USD. It quotes the USD conversion and requests crypto
fees with `debit_currency=USD`; the provider's fiat fee is added to the USD funding
requirement, while the transfer amount remains the user's quoted receive amount.
Fiat fees are charged separately, so they must not also inflate the crypto payout.

Dispatch rechecks funds and fees. If a native wallet becomes insufficient before
submission, it can select USD while preserving the recipient amount. The selected
request and funding requirement are saved atomically with `PAYOUT_SUBMITTING`
before the provider POST. After that point, retries reconcile that exact saved
request and never switch sources or create another payment. Existing persisted
fiat-funded plans retain their original semantics for reconciliation.

Only `available_balance` counts: ledger balances or another stablecoin do not
substitute for spendable funds. A USD fallback requires enough available USD for
both conversion and its separately charged fee. Provider errors and invalid fee
or rate responses fail closed, rather than triggering another payment attempt.

Reference: [Flutterwave v3 stablecoins](https://developer.flutterwave.com/docs/stablecoins).

The default dollar withdrawal minimum is USD 10 after the exchange fee, for both
providers and for crypto withdrawals from every country. NGN bank withdrawals keep
their separate minimum. Settings, quotes and confirmation use `ChargeRate.minWithdrawal`
from the database. Seeding creates the default row with USD 10 but preserves existing
rows; the minimum-default migration changes only the SQL default, not stored values.

Flutterwave payout verification accepts the exact response aliases `SOLANA_MAINNET`
for supported `SOLANA` crypto routes and `ETH_MAINNET` for supported `ETHEREUM`
crypto routes. Bank codes remain exact; all
wallet addresses stay case-sensitive. Reference, provider ID, debit currency,
transfer currency and gross transfer amount must still match. Mismatch diagnostics
record field names only, with no wallet addresses or provider response bodies.
A successful matching verification can settle an existing REVIEW withdrawal;
reference reconciliation only reads the existing transfer and never resends it.

Flutterwave's transfer ID is persisted in `CoinWithdrawal.providerId` immediately
after a provider response is bound to the withdrawal's exact reference, before
validating the remaining settlement fields. A mismatch therefore retains the ID
for later GET `/transfers/{id}` verification, without marking success or restoring
coins. Missing IDs from lost responses are recovered by reference lookup; once an
ID exists it is never replaced or used to submit another transfer.

### Withdrawal authorization methods

Email OTP remains available to all eligible users. Settings expose
`authenticatorEnabled` only when the account has active 2FA. Enabled users may
confirm with `{method: "AUTHENTICATOR", code}` instead of an email challenge.
Both methods authorize the server-stored quote; the client cannot alter its amount
or destination. Authenticator verification uses the same 30-second TOTP window
and shared `lastUsedStep` replay protection as login, under the user row lock.
Recovery codes are not accepted for withdrawals.

The authenticator path enforces an account-wide limit of five attempts per 15
minutes and five failed codes per quote. It stores only an intent-bound HMAC,
factor version and authorization timestamp on CoinWithdrawal, never the code.
An exact retry for that withdrawal can reuse its proof without consuming the TOTP
again. Confirmation, admin approval and unsent dispatch recheck the factor version,
enabled state and password-change time. Changed or disabled factors block unsent
payouts; already-submitted payouts continue reconciliation. Email OTP encryption,
delivery, binding and validation remain unchanged. Apply the additive withdrawal
authenticator migration before deploying the server, then deploy the frontend.

### Provider fee analytics

`CoinWithdrawal.fee` remains Kwonnet's exchange-fee rate. Provider costs use separate
nullable columns, with DECIMAL(30,12) amounts so crypto fees retain precision:

- `estimatedProviderFee`, `estimatedProviderFeeCurrency`,
  `estimatedProviderFeeIncludesConversion`: the latest funding/preflight fee quote.
- `providerFee`, `providerFeeCurrency`, `providerFeeIncludesConversion`: the total
  provider-reported charge after a matching terminal payout response. Never add a
  conversion component to this total a second time.
- `providerFeeSource`: `PROVIDER` for a verified receipt, `RECOVERED_BALANCE` for
  historical Bachs fees derived from completed funding/recovery records.
- `providerConversionFee`, `providerConversionFeeCurrency`: reserved for a separately
  reported conversion component. Native routes record zero; a combined FX charge
  with no provider breakdown remains NULL. Neither current contract reliably
  supplies a separate conversion-only charge, so it is not invented.
- `providerFeesRecordedAt`: when the confirmed/derived fee was recorded.

Bachs reports `fee` and `total_debited` in `source_currency`. On successful recovered
historical payouts, funding minus source principal minus recovered funds gives a
labelled balance-derived charge. The migration only casts guarded numeric JSON and
skips incomplete/malformed/negative results. Bachs quotes do not consistently
separate fees, so their estimate remains unknown until a payout receipt exists.
Reported charges on failed payouts can be returned during fund recovery; these are
not a net-expense ledger. Filter successful payouts for payout-cost analytics and
reconcile failed-payment refunds separately.

Flutterwave native stablecoin estimates use gross transfer amount minus the quoted
receive amount, both in the same stablecoin. Do not subtract the USD-valued wallet
withdrawal amount from a crypto amount. NGN bank fee quotes are recorded in NGN.
USD fallback queries `debit_currency=USD` and stores the quoted
`fee_amount_in_fiat_currency` in USD. Its combined cross-currency transfer charge
has `includesConversion=true`; do not treat it as a separately disclosed FX spread.
Final native `fee` reports populate actuals. Final fiat-funded reports use `fee_amount_in_fiat_currency` when present, otherwise
the v3 transfer `fee`, charged in the debit wallet. A conflicting explicit fee
currency is not silently relabelled.
Missing or invalid optional fee reports never turn a verified payout into a failure.

Quote creation, provider-quote renewal and the final dispatch preflight persist
estimates, including a switch to USD. Actuals are written only after the response
matches reference, ID, destination and amount; Bachs recovery must finish first.
Repeated reconciliation overwrites the same fee snapshot, never increments costs.
Historical Flutterwave gross-ups populate estimates only, not invented actuals.
No provider calls or payments run from the migration.

For example, report actual successful costs by currency and evidence source:

```sql
SELECT gateway, "providerFeeCurrency", "providerFeeSource",
       COUNT(*) AS withdrawals, SUM("providerFee") AS provider_fees,
       COUNT(*) FILTER (WHERE "providerConversionFee" IS NULL) AS conversion_breakdown_unknown
FROM "CoinWithdrawal"
WHERE status = 'SUCCEEDED' AND "providerFee" IS NOT NULL
GROUP BY gateway, "providerFeeCurrency", "providerFeeSource";
```

Report estimated costs separately using the estimated columns; never sum mixed
currencies. Compare NULL counts when assessing analytics completeness.

References: [Bachs payout fields](https://docs.bachs.io/api-reference/payouts/get-payout)
and [Flutterwave stablecoin fees](https://developer.flutterwave.com/docs/stablecoins).

`CoinWithdrawal.receiveAmount` is stored as `DECIMAL(38,18)` for precise numeric
queries across fiat and crypto payouts. The API serializes it as a decimal string.
The conversion migration rejects invalid, non-finite, overflowing or over-precision
historical values rather than silently rounding them.
