# Email verification and password recovery

Credential signup creates an unverified user, registration bonus and verification email outbox record atomically. It returns HTTP 202 with `verificationRequired: true` and no auth cookie/token/session. The web form displays a check-email message. Existing-email signup directs the user back to sign-in/resend; it does not duplicate accounts.

A verification link opens `/auth/verify-email`. The recipient confirms the action, then signs in normally. Verification stamps `emailVerifiedAt` and queues the existing welcome email once. Unverified credential sign-in returns HTTP 403 with inbox/resend guidance. Resend accepts an email address. Google claims are verified server-side, and successful Google registration/login stamps email verification automatically. Google accounts without a password must use Google; reset never creates their first password. A Google user who has set a password can reset it normally.

Reset links open `/auth/reset-password`, where the recipient chooses and confirms a new password. Successful reset updates the bcrypt hash, marks email possession verified, revokes all tracked sessions, disconnects authenticated sockets, removes push endpoints, invalidates outstanding reset links, and queues a password-change security notice. It never signs the user in automatically. Normal password changes invalidate outstanding reset links too.

## Environment

Set these in BOTH API and email-worker deployments:

```dotenv
WEB_APP_URL=https://kwonnet.com
AUTH_EMAIL_TOKEN_SECRET=<random secret of at least 32 characters>
EMAIL_VERIFICATION_TTL_MINUTES=1440
PASSWORD_RESET_TTL_MINUTES=30
APP_LOGO=https://your-public-image-host/kwonnet-logo.png
SMTP_HOST=premium78.web-hosting.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=welcome@kwonnet.com
SMTP_PASSWORD=<mailbox password>
SMTP_FROM=welcome@kwonnet.com
```

Generate the secret with `openssl rand -hex 32`. Do not use an SMTP password or expose this secret as a NEXT_PUBLIC variable. Keep it stable across API/worker replicas and deployments: changing it prevents pending encrypted tokens from being rendered by the email worker. Existing delivered links retain their hash validation until expiry. The optional TTL values accept whole minutes from 5 through 10080. APP_LOGO is required and must point to your publicly accessible HTTPS logo. The MJML templates reference this URL through an image element; the logo is never embedded as base64 or attached to the email. No local-file or automatic logo fallback is used. Existing web API/Google/NextAuth configuration is unchanged.

Redis is required for the queue and the IP-based limit (20 registration/auth-email requests per 15 minutes). A per-account 60-second cooldown prevents repeated reset/resend emails. Requests fail temporarily when rate-limit storage is unavailable. Unknown accounts receive a neutral request response. As explicitly required by the product, known accounts without passwords receive provider guidance.

## Tokens, templates and logging

Tokens use 32 random bytes, SHA-256 hashes for validation, and AES-256-GCM encryption for durable mail rendering. Queue jobs carry only the email record ID. Links carry tokens in the URL fragment, which is not sent to HTTP servers/referrers; action pages have no-referrer metadata and remove the fragment from the address bar. GET requests do not consume tokens, protecting against email link scanners. Tokens are purpose-bound, single-use and expire; resending supersedes previous links. Expired/superseded mail jobs are cancelled before sending. Reset links are never logged. Safe lifecycle events include email record/user IDs and outcomes; SMTP acceptance is not an inbox-delivery receipt.

`templates/email/auth-action.mjml` supplies responsive verification, reset and security-notice emails, with a logo, escaped recipient name, action button, text fallback link and expiry. The existing welcome template also includes the logo. SMTP failures retain the durable recovery/retry behavior.

## Migration and rollout

`20261008000000_auth_email_verification` renames `verifiedAt` to `emailVerifiedAt`, preserves existing non-null dates, and backfills email verification from account creation for every pre-existing account without a date. Identity/account dates are backfilled from account creation only where the corresponding old flags were true. It drops `isVerified`, `identityVerified`, and `accountVerified`. Email/identity/account verification now use nullable timestamps as the only persisted source of truth. Badge selection/ranking and API projections use the new fields; `meta.isLegacy` remains a derived boolean for the existing badge UI.

All pre-existing accounts are treated as email-verified, using their existing verification date or createdAt. Existing sessions remain valid. New credential registrations after migration still start with emailVerifiedAt null and must complete verification. Legacy token validation requires a non-null email verification date.

This migration drops columns used by older server builds. Prepare the environment and new builds first, stop/drain API and workers, run `npm run db:migrate:deploy`, and start the new API/worker/web builds together. Avoid mixing old API images with the new schema. Back up the database first; rolling back only the application image is insufficient after these columns are dropped. No production migration or deployment is performed by this coding task.

## Endpoints

- POST `/api/v1/auth/signup`: create account and verification email; no login.
- POST `/api/v1/auth/resend-verification`: `{email}`.
- POST `/api/v1/auth/verify-email`: `{token}`.
- POST `/api/v1/auth/forgot-password`: `{email}`.
- POST `/api/v1/auth/reset-password`: `{token, newPassword}`.

Verification/reset success returns `{message}`. The existing `/auth/signin` remains the login route.

## Temporarily closing registration

New account creation is disabled by default. `REGISTRATION_ENABLED=false` (or unset) in the API rejects credential signup and first-time Google registration with HTTP 403 before account, wallet, referral, or email creation. Existing credential/Google sign-in, account linking, password recovery, and verification of already-created accounts remain available.

Keep `NEXT_PUBLIC_REGISTRATION_ENABLED=false` (or unset) in the web deployment to hide signup controls and display the closure notice. Old signup URLs show the sign-in form. This uses the existing runtime public configuration; the API flag is authoritative even if a browser has stale UI.

To reopen, set `REGISTRATION_ENABLED=true` on the API and `NEXT_PUBLIC_REGISTRATION_ENABLED=true` on the web deployment, then restart/redeploy those services. Deploy both code changes for closure to take effect; no database migration is needed.
