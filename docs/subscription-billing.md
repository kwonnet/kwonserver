# Subscription billing

The application catalog remains authoritative. Each plan or JSON tier has monthly
and yearly billing options. `SubscriptionProviderPlan` stores an immutable mapping
for provider, account environment, plan, tier, cycle, currency, price and trial
length. Changing a price creates a new mapping; it never edits or cancels a remote
plan used by existing subscribers. `SubscriptionPlan.metadata.flw` is retained for
older clients but is no longer the source for new checkout selection.

## Jobs and deployment

Apply `20261025120000_subscription_provider_catalog_trials` before releasing the
new API and web application. It adds nullable subscription fields and new tables;
it does not rewrite existing subscription records or drop columns. Run Prisma
client generation in the normal build. The existing worker synchronizes the
catalog on startup and every 15 minutes through `sync_subscription_catalog`.
The admin-only `POST /api/v1/payments/flw/sync-subscription-plans` now queues that job
and returns 202 with the job ID. It synchronizes both supported providers.

`reconcile_subscription_payments` runs every five minutes. It checks pending
checkouts, expires trials and single periods without renewal, refreshes provider
subscription state in a fair bounded batch, and recovers Flutterwave charge
webhooks from the last seven days. Older missed charges can be confirmed by their
transaction ID through the checkout status endpoint. It never initiates external
renewal charges: each provider owns its recurring billing schedule.

Configure `FLUTTERWAVE_SECK`, `FLUTTERWAVE_SECRET_HASH`, `BACHS_API_KEY`,
`BACHS_WEBHOOK_SECRET`, and `SUBSCRIPTION_APP_URL`. Register these webhook URLs
on the corresponding provider account and enable retries:

- Flutterwave v3: `/api/v1/payments/flw/webhook`, with the matching secret hash.
- Bachs: `/api/v1/payments/bachs/webhook`, with the existing signed raw-body setup.

Provider environments include a key fingerprint to prevent accidentally applying
another merchant's records. Key rotation therefore requires reconciling/migrating
existing mapping and subscription environment values for the same merchant; do
not simply replace the environment on records belonging to another account.

The Bachs account needs products, checkout, customers and subscription read/write
permissions and access to its trial feature. Start with sandbox credentials.
Legacy subscriptions created before these tables are not automatically enrolled
again or charged. Their existing access dates remain valid. Do not manufacture
provider IDs for them: reconcile their original payment/subscription with the
provider before attaching a mapping and provider subscription ID.

## Checkout and settlement

The authenticated `GET /api/v1/subscriptions/catalog` returns only the account type's
plans, authoritative quotes, eligible offers, current subscription, provider
availability and unfinished checkout. `POST /api/v1/subscriptions/checkouts` accepts
plan/tier/cycle/provider, renewal choice, optional pricing currency (USD or NGN), optional offer ID, and an
`Idempotency-Key`. It accepts no client-supplied price or user ID.

A saved `SubscriptionCheckout` holds the price, email, provider mapping, consent
and exact outbound request before contacting the provider. Requests are serialized
with the buyer's wallet lock. An active subscription or unfinished checkout blocks
another purchase, preventing two providers from charging for competing plans.
After cancelling renewal, the existing paid period must end before a new plan is
started; upgrades and prorated changes are deliberately not implicit purchases.

Flutterwave hosted checkout includes `payment_plan` only for renewal opt-in.
Recurring checkout is card-only. Bachs uses a recurring product cart and supports
recurring USD cards today; it is offered when renewal is enabled. Nigerian users
default to NGN for Flutterwave or wallet coins and can choose USD instead. Global accounts can only select USD. Choosing Bachs visibly selects USD, and the server rejects an explicit NGN Bachs checkout. Bachs bills the
explicitly displayed USD price. No unsupported NGN recurring rail is assumed.

A redirect is never proof of payment. Flutterwave charges are re-fetched by
transaction ID; reference, exact amount, currency, customer and the provider
subscription association must match the saved checkout. Bachs events trigger a
fresh subscription read; customer, product and price must match, and only active
(paid) or trialing (approved free trial) states grant access. Bachs subscription
customer IDs can be in `customer.customer_id`. Both providers retain their opaque
subscription/customer IDs on the local subscription.

`SubscriptionProviderEvent` has a unique provider/environment/receipt identifier.
A database transaction locks the buyer and commits receipt, subscription, checkout
and ledger together. Duplicate callbacks and concurrent browser checks cannot
record a second debit or grant a second period. For Bachs, the verified provider
subscription period is the receipt identity; a trial has a zero-value audit event
and no fabricated payment transaction. Status updates do not shorten a paid period.
Failed or unpaid periods do not grant new access. Provider cancellations turn off
renewal; local cancellation preserves already paid access until its end date.

## Wallet pricing

For a Nigerian account, NGN is the default pricing currency. NGN uses the selected tier's `ngnPrice` and `ChargeRate.ngnPrice` (default 18); choosing USD uses the tier's USD `price` and `ChargeRate.price` (default 0.015). Other accounts always use USD pricing and its global rate. Bachs always uses USD pricing, including for Nigerian users. Divide the monetary price by its corresponding
rate, and round coins upward to two decimal places. The web checkout also submits
the displayed coin quote; a changed price is rejected before debiting or recording
paid trial renewal consent. That quote is a comparison guard, not a trusted price. Yearly prices include the
plan's yearly discount. Catalog quotes include the original yearly cost (12 monthly payments), discount percent, discounted total, savings, and matching coin quotes. Monthly billing has no yearly discount. The modal shows the original cost crossed out and the amount saved per year. For old tiers with no `ngnPrice`, derive their local price
proportionally from the plan's NGN/USD prices and the tier's USD price; an explicit
local tier price overrides this fallback.

The coin amount accepted at signup is saved and used for recurring wallet debits;
changing catalog prices or charge rates does not silently raise an existing
subscriber's agreed coin debit. Trial opt-in stores `renewalCoinAmount` even though
no initial payment exists. At trial end, the normal wallet renewal job can make
that first debit. Insufficient balance follows the existing renewal failure and
retry policy. Bonus coins cannot fund subscriptions.

## Admin trials and consent

At `/dashboard/subscriptions`, ADMIN and SUPER users can create 7- or 14-day
offers for exactly one user or one country ISO3, optionally with a claim deadline.
An offer names a plan and optional tier. Disabling an offer prevents new trial signups;
it does not revoke a trial or provider checkout already reserved. Eligibility
and the claim deadline are checked when signup starts. Country targeting uses the saved user
country. A unique offer/user claim prevents reuse, including concurrent requests.

At signup, renewal is on by default and clearly disclosed before confirmation. Users can turn it off; a trial then grants access and
ends without a charge. With renewal enabled, users choose wallet coins or Bachs saved-card
billing. The trial disclosure shows the amount, billing cycle and cancellation
rule before signup. Bachs creates a native `trial_period` product and grants access
only after its subscription is verified as trialing. Flutterwave v3 payment plans
start with the first paid charge and have no documented deferred free trial in
this flow, so they are available for paid signup, not trial card enrollment.

## Recovery and operational review

Ready mappings are reused. Flutterwave plan creation timeouts are reconciled by
unique versioned name, amount, currency and interval before any retry. Unknown
non-idempotent creates stay in REVIEW if they cannot be found; they are never
blindly repeated. Bachs uses stable idempotency keys and catalog lookup; creation
older than its idempotency window requires review if no matching product exists.

Known Flutterwave links expire after one hour. After expiry plus a 24-hour
settlement grace, a fresh successful-payment lookup can release an abandoned
checkout. A completed settlement is never overwritten by expiry. Bachs expired
checkout state is confirmed directly with its API. Late successful payments remain
verifiable by ID and cannot displace a newer paid subscription.

An uncertain Bachs checkout creation is replayed with its exact saved request
inside the provider's idempotency window. Flutterwave link creation is not blindly
repeated after an unknown response. Check the merchant dashboard and original
reference before resolving such a REVIEW record; do not create a second payment
to work around it. Late payments for a superseded subscription require review
rather than silently replacing a newer paid subscription. Review errors are logged
without persisting card details or provider secrets.

## Provider references

- [Flutterwave v3 payment plans](https://developer.flutterwave.com/docs/payment-plans-1)
- [Create a Flutterwave payment plan](https://developer.flutterwave.com/reference/create-payment-plan-1)
- [Flutterwave hosted checkout](https://developer.flutterwave.com/reference/checkout)
- [Query subscriptions](https://developer.flutterwave.com/reference/get-all-subscriptions)
- [Cancel an individual subscription](https://developer.flutterwave.com/reference/cancel-a-subscription-1)
- [Flutterwave webhooks and verification](https://developer.flutterwave.com/docs/webhooks)
- [Bachs subscriptions](https://docs.bachs.io/guides/subscriptions/overview)
- [Bachs free trials](https://docs.bachs.io/guides/subscriptions/trials)
- [Bachs subscription object](https://docs.bachs.io/api-reference/subscriptions/object)
- [Bachs subscription management](https://docs.bachs.io/guides/subscriptions/manage)

## Subscription checkout presentation

Automatic renewal appears below billing period, currency and payment method, and
is checked by default. The user can turn it off before continuing; the server
uses the submitted boolean and never assumes consent when it is false. Trial
buttons say “Claim offer”; the modal states the free period and the exact paid
renewal amount when renewal is enabled, or that the trial ends without a charge
when it is disabled. Before the final button, links point to Kwonnet's own
`/terms-of-service` and `/privacy-policy` pages.

These pricing and presentation changes require no new environment variables or
database migration. Existing subscriptions retain their saved renewal prices.
