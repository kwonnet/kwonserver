# Realtime delivery and browser request policy

The browser's only routine data poll is authentication, every five minutes. Local
UI countdowns do not make HTTP requests. Explicit actions, pagination, navigation,
network recovery and focus revalidation can still request data.

## Authentication

`kwonweb2/src/providers/AccountSessionProvider.tsx` owns the Auth.js session context.
It checks `/api/auth/session` every 300,000 milliseconds while visible and online.
A shared timestamp per user/session and a browser Web Lock coordinate tabs. Session
results travel over BroadcastChannel and update other tabs without causing another
request. Browsers without Web Locks use the shared timestamp; browsers blocking
storage/channel access fall back to independent visible-tab checks, still at five
minutes. Session copies remain in memory, never localStorage. HTTP-only cookies
remain authoritative. A deliberate account switch/logout invalidates the other
tabs immediately. Revocation hints are scoped to the active server session.

Hidden tabs cancel scheduled auth checks. Resuming a tab only checks when the last
coordinated check is at least five minutes old. Transient network failures preserve
the current identity; confirmed revocation removes private content. Explicit
`useSession().update()` remains available for profile/security changes and renewal
continues through the existing server session endpoint.

## Commit-driven server events

Migration `20261020220000_event_driven_realtime` installs PostgreSQL triggers that
publish small `pg_notify` hints only after the writing transaction commits. Rolled
back writes emit nothing. Hints contain recipient IDs, event kind and optional
conversation/post/session IDs; they contain no message bodies, tokens or balances.

`src/services/v1/notifications/live.ts` shares one LISTEN connection among all
streams in each API process, so worker writes and writes on another API instance
reach the correct connected user. The connection closes after the last subscriber.
Stream failure closes downstream clients so EventSource reconnects and recovers.

| Committed change | SSE kind | Consumer |
| --- | --- | --- |
| Notification insert/delete/read/seen/content | notifications | Inbox snapshot and counts |
| Wallet coins/bonus, checkout/refund state | wallet | Wallet and payment/refund views |
| Encrypted conversation membership/delivery | messages | Message list and encrypted synchronization |
| Quiz settlement | quiz | Author's winner list |
| Confirmed post boost impressions | analytics | Author's boost analytics |
| Session revocation | auth | Active session boundary |
| Post publication/visibility/deletion | feed | Feed availability |

The notification stream takes a snapshot on connection and on notification hints,
coalescing bursts. Its previous five-second database loop is removed. The feed
availability stream takes an initial snapshot and rechecks after post-change hints,
coalesced over 500 ms; its previous one-minute database loop is removed. Heartbeats
keep connections alive but do not query the database. Existing server auth checks
on long-lived streams remain for security.

## Browser views and catch-up

Recurring timers are disabled for trends, tasks, chat lists, boost analytics, quiz
winners, refund status and Bachs payment confirmation. SSE invalidations refresh
matching visible views. Hidden views defer refresh until visible; bursts coalesce.
Trends refresh on focus/navigation rather than triggering a request for every post.
Reconnection emits a catch-up invalidation. Inbox snapshots recover notification
counts, and existing encrypted message cursors recover missed message deliveries.
Message contents still use the established authenticated, device-bound encrypted
sync path and Socket.IO; SSE supplies hints and does not bypass encryption.

Socket.IO uses WebSocket transport directly, without HTTP long-polling fallback.
The API ingress/proxy must allow WebSocket upgrades; networks blocking WebSockets
will not be able to play interactive games until connectivity is restored.

SSE itself is a persistent connection, not client polling. The global user stream
remains connected in hidden tabs for revocation and notifications. Feed availability
streams close while hidden. Device push delivery remains on the existing durable
notification worker. SSE/NOTIFY hints are ephemeral; stored notifications, wallet
records and encrypted message cursors are the durable source of truth. Manual
retry actions and SWR focus/network recovery remain available.

## Direct browser SSE transport

The browser connects directly to the existing backend endpoints:

- `GET ${NEXT_PUBLIC_API_URL}/api/v1/stream`
- `GET ${NEXT_PUBLIC_API_URL}/api/v1/posts/feed/:feed/available/stream`

`kwonweb2/src/lib/realtime.ts` reads the SSE response with browser fetch and
supplies the current access token in the `Authorization: Bearer ...` header.
It does not place tokens in URLs, issue stream tickets, store extra credentials,
or send frontend cookies to the backend. Existing backend authentication,
permission checks and stream revocation checks still apply. Redirects are rejected.
The browser's existing session data already contains the API access token.

The transport parses named/multiline events across UTF-8 and CR/LF chunk
boundaries, ignores heartbeats, bounds event sizes, retries transient outages
with backoff/jitter, and aborts on cleanup. A 60-second silence watchdog recovers
stalled connections; server heartbeats normally arrive every 15 seconds. Reconnect
snapshots and encrypted sync cursors recover durable state; there is no event-ID
replay guarantee. A 401 stops that stream and requests a coordinated auth refresh;
a changed token opens a new stream. A 403 stops without repeatedly retrying.

The old Next.js `/api/events` relay returns HTTP 410 with a reload instruction.
No updated client uses it, and it no longer opens an upstream stream. Existing
open browser pages should be reloaded after deployment. Connection timeouts for
these new streams are controlled by the backend ingress, not the frontend Cloud
Run service. The backend now owns the full connection capacity and bandwidth.

Set `NEXT_PUBLIC_API_URL` to the **browser-accessible HTTPS backend origin**, not
the frontend host or a frontend rewrite. The backend's `REMOTE_APP_URL` origin
allowlist must include every served frontend origin, including production and
beta where applicable. Existing CORS middleware allows Authorization preflights;
their successful responses are cached for 600 seconds. Do not change this to a
wildcard cookie policy. Make sure backend ingress supports unbuffered SSE and
passes heartbeat chunks through promptly.

To verify in browser DevTools, filter Network requests for `stream`: the request
URL must point to the backend host, the response type must be text/event-stream,
and the request must contain an Authorization header. There should be no
long-lived frontend `/api/events` request. Test notifications, a hidden/visible
feed, disconnect/reconnect, and session revocation on both frontend origins.

## Deployment

1. Apply the migration before starting the updated API and worker processes.
2. Set `DATABASE_REALTIME_URL` to a **direct or session-mode PostgreSQL connection**
   when ordinary `DATABASE_URL` uses transaction pooling. LISTEN requires a stable
   session. The fallback order is `DATABASE_REALTIME_URL`,
   `DATABASE_MIGRATION_URL`, `DATABASE_URL`.
3. Deploy the updated server, then frontend. Without the triggers/server update,
   the frontend will not receive the replacement invalidations.
4. Check logs for `realtime_listener_disconnected` or
   `notification_stream_unavailable`. Verify session requests are five minutes
   apart, hidden tabs make no routine auth requests, and new notifications and
   messages arrive without periodic page fetches.

Persistent SSE connections still consume hosting resources. Removing polling does
not guarantee a particular Cloud Run bill; measure request paths, open streams and
instance time after deployment.
