# Messaging scaling implementation and rollout

The service keeps PostgreSQL for membership, ciphertext messages, public prekeys, receipts and metadata. File bytes go directly between the browser and a private R2/S3 bucket. Redis carries socket hints after the PostgreSQL commit; lost hints are recovered using the existing durable message/receipt cursors.

## Configure private storage

Create a separate private bucket, for example `kwonnet-messages`. Disable public domains and r2.dev access. Create an R2 S3 API token scoped to read/write objects in that bucket. Configure these server-only settings on **both the API and the worker**:

```dotenv
MESSAGING_STORAGE_BUCKET=kwonnet-messages
MESSAGING_STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
MESSAGING_STORAGE_REGION=auto
MESSAGING_STORAGE_ACCESS_KEY_ID=<bucket-scoped access key>
MESSAGING_STORAGE_SECRET_ACCESS_KEY=<bucket-scoped secret>
```

For AWS S3, omit the custom endpoint, set the actual bucket region, and supply credentials or an IAM role through the AWS SDK's standard credential chain. No storage credentials belong in `NEXT_PUBLIC_*` settings. PostgreSQL and Redis use their existing settings.

Apply [private-bucket-cors.json](private-bucket-cors.json), adjusting origins to the actual web origins. PUT grants sign the content type, exact content length and `If-None-Match: *` to prevent overwrites. The browser automatically supplies Content-Length. GET grants expire in 60 seconds. PUT grants last at most five minutes and cannot outlive their pending reservation. Configure a bucket lifecycle deleting objects under `e2ee/` after 90 days as a backstop for orphaned uploads.

Files remain AES-GCM encrypted by the browser. Keys, nonces, original filenames and MIME types remain inside the Signal payload. The API authorizes reservation and download requests; finalization checks the remote object's size. PostgreSQL stores the object key, encrypted length and hash, never new file bytes. Encryption/hash validation on the recipient detects ciphertext corruption.

## Deploy

1. Configure the private bucket and server secrets before enabling new attachments. Text messaging remains available when storage is unconfigured.
2. Apply `20261008060000_messaging_scale` through the normal migration/deployment flow. It creates account-level delivery state, backfills existing receipt state and initializes member unread/unseen counters. It adds indexes for sync, expiry and relay recovery.
3. Deploy the API, worker and web client together. The old binary PUT attachment endpoint is replaced by reservation, direct private upload and finalization. Existing download clients continue to receive legacy bytes until their records are migrated; deploy the new web client for signed object downloads.
4. The worker runs `migrate_messaging_blobs` each minute when private storage is configured. It copies existing encrypted PostgreSQL blobs without decrypting them, updates the object key and clears database bytes after upload. Old bytes remain readable until this succeeds. The compatibility column is intentionally retained for this migration period.
5. The five-minute retention job removes expired history in bounded batches, reconciles counters, and deletes expired/discarded objects. Discarded uploads wait until any PUT grant expires before their metadata/object is deleted.

## Delivery and database load

- The browser uses authenticated, device-bound socket RPCs for send, sync and batched receipts after signing the server's device challenge. HTTP remains a fallback and handles enrollment, requests and storage grants.
- Each API instance maintains one Redis subscription. No API instance polls PostgreSQL every second for live hints. Socket hints carry only thread/device IDs, not message content or read status.
- Message and receipt transactions append durable outbox rows. A post-commit publisher leases batches with SKIP LOCKED, checks current policy, publishes hints through Redis, and marks rows published. Failed rows stay recoverable; a worker recovery job runs every minute. Delivery is at-least-once and clients deduplicate using message IDs/cursors.
- The active thread performs a 60-second healthy safety sync. Disconnected fallback starts around five seconds and backs off to 60 seconds with jitter. Background tabs avoid periodic thread sync. Reconnect/focus/online events trigger catch-up. Inbox safety refresh is two minutes when live or 30 seconds when disconnected, with hints triggering earlier refresh.
- Socket hints coalesce. Receipt IDs coalesce in 250ms windows and are sent in batches of up to 100; READ supersedes DELIVERED. Encrypted actions processed in a focused accepted chat can be acknowledged independently of the original text they reference. Pending requests still suppress receipts and typing.
- Unread/unseen state is maintained once per recipient account, not once per device. Sends increment the member row. Delivery/read transitions, hiding, rejection and expiry reconcile it inside locked transactions. Duplicate and secondary-device receipts do not decrement twice. Inbox and account badge queries read/sum these stored counters instead of scanning message history. Profile hydration is batched as well.

This removes important bottlenecks; it is not proof of capacity for millions of concurrent users. Hardware, network latency, message rate, devices per user, storage quotas and connection budgets still matter.

## Run the reproducible workload

```bash
npm run test:messaging:load
MESSAGING_LOAD_PAIRS=50 MESSAGING_LOAD_MESSAGES=20 npm run test:messaging:load
```

The harness starts disposable PostgreSQL, Redis and authenticated S3-compatible storage, applies the actual migrations, and mounts two API/socket servers. It uses real sessions/JWTs, public-key enrollment, Signal encryption/decryption and device challenge signatures. Workload includes concurrent sender/receiver pairs, secondary devices, private previews and acceptance, identical ciphertext retries, reconnect catch-up, encrypted file uploads/downloads and receipts/counter convergence.

Results are written to `reports/messaging-load.json`: send-ack/delivery p50/p95, throughput, HTTP/socket request counts, event-loop delay, CPU, RSS growth, retries, devices and failures. Setup and key generation are excluded from the timed messaging phase. The two API servers share one Node process/database pool in this local harness; it does not simulate multi-host routing or real production network latency. Use a dedicated staging deployment and an external load generator for production-capacity claims.

Default: 10 pairs, 10 messages per pair. Parameters are bounded to 200 pairs and 50 messages per pair to prevent accidental unbounded local workloads. The test refuses any database other than the disposable test URL. It does not use production accounts, live buckets or production Redis.

## Recorded local workload (2026-10-08)

The recorded 25-pair run used 50 users, 59 devices and 500 logical Signal messages. It received 680 encrypted envelopes, checked 25 duplicate retries and seven silent requests, and recovered one deliberately interrupted socket request through HTTP. Nine encrypted 64 KiB object transfers were exercised. There were zero unrecovered failures; all stored unread/unseen counters converged to zero.

| Measurement | Local result |
|---|---:|
| Timed messaging phase | 5.967 seconds |
| Aggregate logical messages/sec | 83.8 |
| Send acknowledgement p50 / p95 | 46.12 / 90.96 ms |
| Envelope delivery p50 / p95 | 115.30 / 635.33 ms |
| Event-loop p95 | 32.98 ms |
| Combined process CPU | 6,440.97 ms |
| Combined process RSS growth | 261.25 MiB |

CPU and memory include the load generator, its Signal stores and both API servers in one Vitest process. These values cannot be treated as server-only production resource estimates. Reported delivery measures successful envelope decryption, not human read time. This is a repeatable local baseline, not a saturation test or a claim of million-user capacity.

Primary configuration references: [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [R2 S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/), [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/).
