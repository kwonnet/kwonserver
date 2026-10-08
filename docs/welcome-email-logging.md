# Welcome email delivery and server diagnostics

## Registration and delivery

Password registration and first-time Google registration both call `createUser`.
The account, registration bonus and registration `EmailMessage` outbox record commit in one
PostgreSQL transaction. Credentials queue verification first; successful verification later creates the unique `eventKey = welcome:<userId>` welcome message. Google registration queues that welcome message immediately. Duplicate
registration attempts, linking Google to an existing account, and ordinary login
do not create another welcome message.

After commit, registration immediately adds `email` to the BullMQ queue named
**`emailDeliveryQueue`**, using job ID **`email-<EmailMessage.id>`**. The queue data
contains only the email-message ID. A failed enqueue does not undo a successfully
registered account: the outbox remains pending and the once-per-minute
`recover_email_messages` job queues it again when due.

The separate worker claims the message with a two-minute database lease, loads the
registered user's current email address, renders `templates/email/welcome.mjml`,
and sends its HTML/text through Nodemailer. Only SMTP acceptance marks the record
`SENT`. The email uses a stable Message-ID, founder signature and links to Kwonnet.
Deleted, deactivated or banned accounts are cancelled rather than emailed.

SMTP failures persist their error code and retry deadline **and fail the BullMQ
job**. They no longer appear as successful execution. Database state owns retry
eligibility; a queue retry arriving before that deadline is logged as skipped.
The recovery job retries failed jobs or replaces a retained completed job when
the corresponding database message is pending and due. Real send attempts are
limited to five. Missing configuration remains retryable without consuming send
attempts. `SMTP_FROM` accepts a mailbox or standard `Display name <mailbox>` format;
configuration diagnostics identify invalid setting names without logging values.

Successful jobs remain inspectable for up to one day/1,000 records; failed jobs
remain for up to seven days/1,000 records. The outbox's `SENT` state prevents
re-sending already completed registrations after jobs age out.

SMTP acceptance means the receiving mail server accepted the message; inbox
placement is outside the queue's guarantee. Delivery is at least once: a crash
after SMTP acceptance but before the database acknowledgement may resend it.
The stable Message-ID helps reconciliation but SMTP has no exactly-once guarantee.

## Events to look for

| Event | Meaning |
| --- | --- |
| `account_registered` | Account and registration outbox committed; includes safe user/email-message IDs. |
| `email_job_queued` | Welcome job added to `emailDeliveryQueue`. |
| `email_job_requeued` | Durable recovery retried a failed job. |
| `registration_email_enqueue_deferred` | Registration succeeded; Redis enqueue failed and recovery will retry. |
| `job_started` | A worker began the job; includes queue, job ID, resource ID and attempt. |
| `email_delivery_started` | Welcome delivery began. |
| `email_delivery_sent` | SMTP accepted the message; includes duration, attempt and accepted count. |
| `email_delivery_skipped` | Already settled/leased, or its retry is not due. This is not an SMTP send. |
| `email_delivery_cancelled` | Account is no longer eligible for mail. |
| `email_delivery_retry_scheduled` | Send failed; error code and next attempt time are recorded. |
| `email_delivery_failed` | Send attempts exhausted; needs operational inspection. |
| `job_completed`, `job_failed`, `job_stalled` | Generic job execution outcome; completion alone does not prove an email was sent. |
| `queue_ready`, `queue_idle`, `queue_paused`, `queue_resumed`, `queue_closed`, `queue_error` | Worker lifecycle and connectivity. |
| `service_failed` | Service and operation with sanitized error name, code, message, stack and cause. |
| `request_started`, `request_completed`, `request_failed`, `request_aborted` | API lifecycle, status, duration and request ID. |

Workers for subscriptions, reminders, email, embeddings, topics, keywords,
recurring jobs and quiz generation all use the same lifecycle logger. Existing
service catch blocks and promise error callbacks have contextual diagnostics;
unstructured runtime service console dumps were replaced with structured messages.
API responses expose `X-Request-ID` so a reported failure can be correlated with
service and request logs. Route templates are logged; raw request URLs/query
strings, request bodies and authorization headers are not.

The central logger redacts sensitive fields recursively, strips credential-bearing
URLs, bearer/JWT tokens, email addresses and IP literals, and hides ORM argument
dumps and SMTP authentication responses. Job data and provider response bodies are
not copied into lifecycle events. User, post, category, subscription, job and
outbox IDs are safe correlation fields; tokens and encryption keys are not.

## Production checks

The Compute deployment runs the API as `kwonserver` with background work disabled,
and **`kwonserver-worker`** with it enabled. Both containers receive the same env
file. Mail delivery is visible primarily in the worker logs:

```sh
sudo docker logs --since=30m kwonserver-worker 2>&1 | rg 'email_|job_|queue_|service_failed'
sudo docker logs --since=30m kwonserver 2>&1 | rg 'account_registered|welcome_email|request_failed'
```

Inspect database state without selecting addresses or mail content:

```sql
SELECT id, "userId", status, attempts, "lastErrorCode", "nextAttemptAt", "sentAt"
FROM "EmailMessage"
ORDER BY "createdAt" DESC LIMIT 50;
```

An `account_registered`/`email_job_queued` pair with no `job_started` indicates that
the email worker is not consuming the queue; check worker startup and Redis
connectivity. `email_delivery_retry_scheduled` explains provider/configuration
failure. `email_delivery_sent` confirms SMTP acceptance. No new database migration
or mail environment variable is needed for this update. Deploy the API and worker
together. Existing pending registration messages are picked up automatically.

Tests exercise immediate enqueue, Redis failure fallback, complete registration
through a real Redis queue and PostgreSQL outbox with a mocked SMTP transport,
SMTP rejection/recovery, job retention, safe logging and request correlation.

## Verification and reset update

Credential signup now queues VERIFY_EMAIL and does not issue a session. The welcome message is queued once after successful verification. Google registration still queues the welcome immediately because Google email claims are verified. Auth/reset/security-notice emails share the same durable worker and SMTP settings. See [Email verification and password recovery](auth-email-verification.md) for the new secret, TTL/logo settings and the migration of verification flags. The registration enqueue fallback event is now `registration_email_enqueue_deferred`.

All MJML mail templates use the external HTTPS image URL configured as `APP_LOGO` on the API and worker. No logo bytes, base64 data URL, CID attachment or local-file fallback is included in emails. Missing/invalid APP_LOGO causes a safe configuration error and durable mail retry.
