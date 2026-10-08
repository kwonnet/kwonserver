# Kwonnet E2EE messaging: implementation guide and reference design

Signal v2 has now been integrated into the existing client, PostgreSQL relay and messaging UI. See [deployment and implementation status](e2ee-messaging-deployment.md) for the actual release steps, storage limits, protocol scope and validation. The excerpts in this document remain design/reference material; the active implementation is under `src/` in the server and web repositories. Integration and tests do not constitute an independent cryptographic audit.

Scope: authenticated, direct, one-to-one conversations, with multiple devices per account. Group encryption, anonymous messaging, calls, and federated servers require separate designs. Keep anonymous messages out of this protocol until their identity and abuse models are defined.

## Baseline architecture findings before implementation

The implementation extends these existing modules:

| Concern | Existing destination |
|---|---|
| HTTP routes | `kwonserver/src/routes/v1/conversations/index.ts` |
| Validation and HTTP responses | `kwonserver/src/controllers/v1/conversations/index.ts` |
| Membership, request policy, persistence, prekey claims | `kwonserver/src/services/v1/conversations/index.ts` |
| Authenticated socket transport | `kwonserver/src/socketIo/convoSocketIo.ts` |
| Durable notification/relay jobs | Existing cron queues and worker infrastructure |
| Client API calls | `kwonweb/src/lib/conversations/index.ts` |
| Device and session adapter | `kwonweb/src/lib/signal/` |
| Message contracts | `kwonweb/src/types/conversation.ts`; mirrored server validation |
| Inbox and Requests UI | Existing `messages/[[...slug]]` components |
| Vault and connection state | Existing providers/hooks and account switching flow |

Before this change, active server conversations used MongoDB models, although Prisma also contained a separate conversation schema. The integrated Signal v2 path now uses additive E2 tables in PostgreSQL; the old Mongo records remain an archive. Do not assume editing those Prisma models changes the current message path. A move to PostgreSQL needs explicit backfill, read routing, sequence/cursor compatibility, and a controlled cutover. Existing `ConvoMembership.userId @unique` permits only one conversation per user; replace it with compound `(conversationId, userId)` uniqueness during that migration.

Findings from the current code, rather than a complete security audit:

- `src/socketIo/convoSocketIo.ts` accepts arbitrary `convo:join`/`room:join` room names without membership authorization in those handlers. Replace these before relying on room isolation.
- `message:send` uses envelope `fromUserId`, `fromDeviceId`, and recipient IDs from the client. Bind sender identity/device to the authenticated session and validate all recipients against the conversation/device registry.
- `message:receipt` accepts a client `userId` and updates seen/read without a pending-request gate in that handler. HTTP receipt paths must enforce the same gate.
- `kwonweb/src/lib/sodium/x3dh.ts` derives three/four DH values on initiation, but two different values on response. Those paths are not a symmetric, interoperable X3DH implementation.
- The custom ratchet has a locally designed hash-based KDF. Do not describe it as an implementation of Signal's specified key derivation without conformance tests and review.
- `src/lib/signal/deviceManager.ts` uses global IndexedDB keys across accounts, and its `exportBundle()` returns objects containing private prekey material. Publish explicit public-key projections only; retain private keys locally, account/device scoped.

Choose one versioned protocol. Use the installed Signal TypeScript package behind a storage adapter rather than repairing a homemade ratchet in place. This package is a third-party implementation, not the current official Signal stack and not an assurance of independent audit. Its license and maintenance must be reviewed. Classical X3DH/Double Ratchet is not post-quantum; a later PQXDH/Triple Ratchet migration requires a compatible implementation and negotiated protocol versions. [Signal specifications](https://signal.org/docs/), [package source and license](https://github.com/privacyresearchgroup/libsignal-protocol-typescript).

## 1. End-to-end sequence

```text
Sender device A        Relay + PostgreSQL         Receiver device B / local vault
     |                           |                              |
     |                           |<-- enroll PUBLIC identity, --|
     |                           |    signed key, one-time keys |
     |-- claim bundle for B ---->|                              |
     |<-- signed bundle + OPK ---|  atomic OPK reservation       |
     | verify signature and pinned identity                    |
     | X3DH -> session -> encrypt payload                       |
     | COMMIT next ratchet + exact ciphertext to local outbox   |
     |-- message:send (id) ----->|                              |
     |                           | lock policy; non-contact ->  |
     |                           | PENDING_REQUEST; commit msg  |
     |<-- ack stored: SENT ------| + targeted outbox entry      |
     |                           |-- ciphertext -> B only ---->|
     |                           |                              | decrypt + COMMIT
     |                           |                              | ratchet/projection
     |                           |                              | Requests preview
     |                           |                              | remember read IDs
     |                           |    NO delivery/read/typing/presence/bootstrap ACK
     |     Sender continues to see SENT                         |
     |                           |                              |
     |                           |<-- request:accept + exact ---|
     |                           |    delivered/read ID sets    |
     |                           | lock conversation + block   |
     |                           | policy; validate envelope    |
     |                           | ownership; ACCEPTED + outbox |
     |                           |-- accepted state to B ------>|
     |<-- DELIVERED then READ ---| for actually processed/viewed IDs
     |                           |                              | move to Inbox
     |                           |                              | activate receipts
     |-- next encrypted send --->|-- ciphertext -> B ---------->|
     |<-- durable delivered -----|<-- delivered after commit ---|
     |<-- durable read ----------|<-- read when visible/unlocked|
```

Prekey claims happen before preview; the sender may learn that a registered device exists, but not whether that device previewed anything. Never send `session:ack` back to a pending sender. Initial Signal prekey messages support asynchronous delivery without that ACK.

`SENT` means the relay committed the logical message, not that a device decrypted it. `DELIVERED` means at least one recipient device durably processed it. `READ` means at least one recipient device explicitly reported it visible to the user. Own-device sync is excluded from these aggregates. A socket connection or successful push-provider response is not delivery.

Read/delivered events use WebSockets as transport but their state is durable and replayable. Typing is ephemeral, expires after about five seconds, and is never replayed. This distinction prevents lost acknowledgments or reconnects from moving statuses backwards. [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/).

Contacts must be a defined, authoritative relation: for Kwonnet use an accepted mutual follow relationship, or introduce explicit accepted contacts. A pending follow, unilateral follow, or profile subscription is not automatically a messaging contact. Lock the policy relation when creating/accepting a request. Contact changes do not retroactively accept a request silently.

## 2. Payload contracts and schema

```ts
export type ConversationState = 'PENDING_REQUEST' | 'ACCEPTED' | 'BLOCKED';
export type MessageStatus = 'SENT' | 'DELIVERED' | 'READ';
export type Protocol = 'signal-classic-v1';
export type MessageRef = {eventId: string; contentHash: string};
// Hash canonical UTF-8 content bytes (RFC 8785 JSON canonicalization), not mutable UI HTML.
export type Media = {
  v: 1; blobId: string; keyB64: string; ivB64: string;
  ciphertextSha256B64: string; ciphertextBytes: number;
  plaintextBytes: number; mime: string; filename: string;
};
export type Content =
  | {kind: 'text'; text: string; replyTo?: MessageRef}
  | {kind: 'media'; text?: string; attachments: Media[]; replyTo?: MessageRef}
  | {kind: 'reaction'; target: MessageRef; emoji: string; op: 'add' | 'remove'}
  | {kind: 'edit'; target: MessageRef; revision: number; previousRevisionHash: string; replacement: {text: string}}
  | {kind: 'delete'; target: MessageRef; issuedAt: string; signatureB64: string}
  | {kind: 'receipt'; deliveredEventIds: string[]; readEventIds: string[]};
export type ClearEvent = {
  v: 1; eventId: string; conversationId: string;
  senderUserId: string; senderDeviceId: string; recipientUserId: string;
  content: Content;
};
export type DeviceEnvelope = {
  recipientDeviceId: string; wireType: 1 | 3; ciphertextB64: string;
};
export type SendCommand = {
  protocol: Protocol; conversationId: string; clientId: string;
  envelopes: DeviceEnvelope[];
};
export type ReceiptCommand = {
  conversationId: string; messageIds: string[]; expectedEpoch: number;
};
export type AcceptCommand = {
  conversationId: string; deliveredIds: string[]; readIds: string[];
  expectedEpoch: number; commandId: string;
};
```

Validate these discriminated unions with strict Zod schemas on each side. Outer IDs must be UUIDs, ciphertext valid bounded base64, `wireType` exactly 1 or 3, no duplicate recipient device IDs, at most the configured device limit, and bounded total frame size. Enforce 64 KiB maximum ciphertext per envelope, 10 devices/account, 100 receipt IDs per operation, and 10 attachments per message as initial configurable limits. Limit decoded bytes as well as string length. Do not accept arbitrary `meta`, sender IDs, MIME types, storage paths, or raw URLs on the outer message.

All message features are immutable encrypted events. Reactions do not expose the emoji to PostgreSQL. Replies quote both event ID and content hash; verify the referenced original belongs to the conversation. Edits create new encrypted events, preserve the original author identity, and apply only a matching revision chain. A fork must be surfaced/resolved deterministically, not silently overwritten by server timestamps. Late edit/reaction events must not resurrect a deletion tombstone. Deleting an original keeps a neutral “original message deleted” reply placeholder.

The Signal library encodes its own ratchet header, authentication material, and encryption internals in `body`. Store the complete opaque body; do not fabricate a separate AEAD nonce or mix it with the existing libsodium envelope. Only attachments and the local vault use the AES-GCM helpers here. [Double Ratchet specification](https://signal.org/docs/specifications/doubleratchet/).

The full relational reference schema is `docs/e2ee/schema.prisma`. It is standalone and uses `E2*` names to avoid accidentally replacing live models. Map `E2User` to existing `User`, preserve foreign keys, and register device ownership before migration. No private identity keys, private prekeys, root keys, chain keys, attachment keys, plaintext content, or read-preview history belongs on the relay.

Production migrations should add CHECK constraints for positive numeric device/key IDs, ciphertext byte length, two distinct direct-conversation users, receipt `readAt IS NULL OR readAt >= deliveredAt`, and exact conversation membership. Use FKs/triggers or locked service validation for device/conversation ownership. Add an immutable device-enrollment binding, device roster version, and contact/block constraints. The sample schema does not make arbitrary client/device IDs authoritative.

`E2Message` is one logical event; `E2Envelope` holds one ciphertext per target device; `E2Receipt` holds published status per recipient device. Do not store a single per-envelope status as the user-visible status. `E2Outbox` is the durable post-commit event source. BigInt sequence values cross JSON as decimal strings, never JavaScript numbers.

### Event contracts

| Event | Input | Authorization and result |
|---|---|---|
| `message:send` | SendCommand | Device ownership, membership, allowed recipient roster, request quota; ACK only after database commit |
| `message:new` | Targeted opaque envelope + sequence | Recipient device room only; main Inbox or Requests selected locally |
| `message:delivered` | ReceiptCommand | Actual recipient envelope, ACCEPTED state, current epoch; monotonic durable update |
| `message:read` | ReceiptCommand | Same gate; READ implies DELIVERED; durable replay |
| `typing:start` / `typing:stop` | conversationId + epoch | ACCEPTED only; recipient-only fanout, five-second TTL, per-device throttling |
| `reaction:add` | SendCommand | Same encrypted-event relay; reaction details remain inside ciphertext |
| `message:edit` | SendCommand | Same encrypted-event relay; clients enforce original author and revision chain |
| `message:delete` | SendCommand | Signed encrypted deletion event; clients enforce signer and original author |
| `request:accept` | AcceptCommand | Approver only; transactional transition + bounded retroactive receipts |
| `request:reject` / `request:block` | conversationId + epoch + commandId | Approver only; private policy change and local purge; no rejection notification to sender |

Prefer sending all content actions through `message:send`; distinct outer reaction/edit/delete event names leak feature metadata. The aliases are only compatibility adapters, never plaintext mutation endpoints.

Delete for Me is an encrypted local tombstone and optionally encrypted own-device sync. It does not revoke other users' access. Delete for Everyone is a separately signed, domain-separated deletion statement inside each encrypted event. An application signing key must be enrollment-bound to the sender's device, not an arbitrary key carried in the message. Use Ed25519 over canonical bytes:

```ts
const deleteBytes = new TextEncoder().encode(JSON.stringify([
  'kwonnet-delete', 1, conversationId, originalEventId,
  originalContentHash, deletingEventId, senderUserId, senderDeviceId,
]));
// Sender: sodium.crypto_sign_detached(deleteBytes, enrolledActionPrivateKey)
// Receiver: verify with pinned enrollment-bound public key; verify original sender
// user, conversation, original hash, event ID uniqueness, and deletion policy.
```

This provides application-level authentication and non-deniable signatures, unlike the deniability goal of the Signal channel. That is a deliberate product tradeoff. A malicious recipient can retain screenshots/plaintext; deletion is not cryptographic recall. Server-side immediate purge requires a separate authenticated/signed outer deletion command, which exposes the target/action to the relay. Without that opt-in metadata tradeoff, the relay only sees an opaque event and ciphertext ages out by retention policy.

## 3. Next.js/React client implementation

### Device setup and public prekeys

1. Create a device UUID and a unique positive numeric Signal device ID. Store both under `(accountId, deviceId)`, never global `deviceId`/`identityKeyPair` keys.
2. Generate an identity with `KeyHelper.generateIdentityKeyPair()`, registration ID, signed prekey, and a batch of monotonically numbered one-time prekeys.
3. Commit their private material to the encrypted vault BEFORE publishing any public bundle. Never reuse key IDs after restore/rotation.
4. Export ONLY `identity.pubKey`, signed prekey public key/signature/key ID, and OPK public keys/key IDs. Keep the private halves locally.
5. Claim a prekey bundle, verify the signed prekey signature, compare the identity against the pinned peer identity, and require explicit approval for identity changes.
6. Use one pairwise session per local-device/remote-device pair. Encrypt separately to all recipient devices and the sender's other devices; only recipient devices affect delivery/read aggregates.

This is the installed library's API, not a custom ratchet:

```ts
import {SessionBuilder, SessionCipher, SignalProtocolAddress,
  type DeviceType, type StorageType} from '@privacyresearch/libsignal-protocol-typescript';

async function establish(store: StorageType, remoteUserId: string,
  signalDeviceId: number, enrolledDeviceUuid: string, verifiedBundle: DeviceType<ArrayBuffer>) {
  const address = new SignalProtocolAddress(`${remoteUserId}:${enrolledDeviceUuid}`, signalDeviceId);
  await new SessionBuilder(store, address).processPreKey(verifiedBundle);
  return address;
}
async function encryptEvent(store: StorageType, address: SignalProtocolAddress,
  event: ClearEvent): Promise<DeviceEnvelope['ciphertextB64']> {
  const bytes = new TextEncoder().encode(JSON.stringify(event));
  const message = await new SessionCipher(store, address).encrypt(bytes.buffer);
  if (!message.body || (message.type !== 1 && message.type !== 3)) throw new Error('Unsupported encrypted message');
  // body is a binary string in this package, not already base64.
  return btoa(message.body);
}
async function decryptEvent(store: StorageType, address: SignalProtocolAddress,
  wire: DeviceEnvelope): Promise<unknown> {
  const body = Uint8Array.from(atob(wire.ciphertextB64), c => c.charCodeAt(0)).buffer;
  const cipher = new SessionCipher(store, address);
  const clear = wire.wireType === 3
    ? await cipher.decryptPreKeyWhisperMessage(body)
    : await cipher.decryptWhisperMessage(body);
  return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(clear));
}
```

Return both `wireType` and encoded body in the real adapter; the excerpt above isolates body conversion. After decrypt, strict-validate the payload, compare conversation/event/sender/recipient IDs against the authenticated outer routing context, and verify the original-author rule for actions. Parsing and context validation must occur inside the storage transaction; failures must roll back ratchet/prekey changes. Do not accept decrypted JSON as trustworthy merely because it parsed.

The complete `DraftSignalStore` reference in `kwonweb/docs/e2ee/signal.ts` implements the installed package's `StorageType` callbacks against an in-memory transaction draft. Its `encryptBatch` commits all target ratchets and the saved ciphertext atomically; `decryptAndCommit` validates before committing. Connect enrollment, strict payload validation, identity approval and server sync before using it. Store keys include: identity pair, registration ID, pinned remote identities, prekeys, signed prekeys, session records, removals. Convert ArrayBuffers using explicit public/private key DTOs, not `JSON.stringify(ArrayBuffer)` which loses bytes. `isTrustedIdentity` must compare pinned bytes and fail closed on a changed identity; `saveIdentity` must not silently approve a replacement. The installed package checks trust with address.name but saves with address.toString(); normalize the numeric address suffix and include the enrolled device UUID in the address name so separate devices do not overwrite pins. First use is TOFU and remains vulnerable to a malicious directory unless users verify fingerprints or you add key transparency.

### Passphrase-protected IndexedDB and crash consistency

Use `kwonweb/docs/e2ee/vault.ts` as the bounded atomic snapshot example. It encrypts the entire snapshot with a non-extractable AES-GCM data encryption key (DEK), binds it to the account/device via associated data, serializes writers using Web Locks, and resolves writes on IndexedDB transaction completion. It stores ciphertext at rest; unlocked plaintext lives in memory. Large chat archives should use encrypted per-record stores with a batched atomic commit adapter, rather than rewriting an unbounded snapshot.

Protect a randomly generated 256-bit DEK using an Argon2id-derived key-encryption key (KEK). Store only the salt, versioned/bounded KDF parameters, wrapped DEK, and wrap IV in IndexedDB. Never persist an unwrapped CryptoKey or plaintext passcode. The KEK is derived locally and is never sent to the server. Example derivation using the existing sodium dependency:

```ts
await sodium.ready;
const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
const kekBytes = sodium.crypto_pwhash(32, passphrase, salt,
  sodium.crypto_pwhash_OPSLIMIT_MODERATE,
  sodium.crypto_pwhash_MEMLIMIT_MODERATE,
  sodium.crypto_pwhash_ALG_ARGON2ID13);
const kek = await crypto.subtle.importKey('raw', kekBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
sodium.memzero(kekBytes);
// Generate a random raw 32-byte DEK. AES-GCM-encrypt it under kek with a fresh
// 12-byte IV and AAD ['kwonnet-vault-wrap', 1, userId, deviceId, kdfProfile].
// Persist this header atomically BEFORE allowing protocol enrollment.
// Import the DEK with extractable=false for vault.unlock(); then wipe raw bytes.
```

Use a fixed supported Argon2 profile with measured browser memory/latency limits; reject unexpected profile/algorithm values rather than accepting untrusted resource parameters. Run derivation in a Worker, handle allocation failure, and benchmark low-memory devices. Prefer a strong passphrase. A six-digit PIN with ciphertext/salt available is vulnerable to offline brute force; UI throttling does not fix that. Optional platform-bound WebAuthn PRF protection requires capability detection and a recovery design; do not improvise fallback to a plaintext key. [Libsodium password hashing](https://libsodium.gitbook.io/doc/password_hashing/default_phf).

Passphrase changes rewrap the DEK rather than re-encrypting the archive. Account-password reset must not silently reset the E2EE passphrase or upload old keys. Loss of all trusted devices and recovery material means old messages cannot be recovered. Use an optional user-held random recovery key for encrypted backup, with separate consent. Restoring old ratchet state on two active devices can reuse state/keys: restore history to a NEW device identity, retire old enrollments, and establish new sessions.

Atomic operations:

```ts
await vault.atomic(async draft => {
  // createDraftSignalStore implements StorageType over draft.records.
  const store = createDraftSignalStore(draft);
  const wire = await encryptAllTargetDevices(store, clearEvent, verifiedRoster);
  draft.outbox[clearEvent.eventId] = JSON.stringify(wire);
});
// Only after commit send the saved outbox envelope. Retry exact bytes and clientId.

await vault.atomic(async draft => {
  if (draft.inbox[serverMessageId]) return; // Idempotent replay, before ratchet decrypt.
  const clear = await decryptAndValidate(createDraftSignalStore(draft), envelope);
  draft.inbox[serverMessageId] = JSON.stringify({clear, locallyDelivered: true,
    locallyRead: false, pendingReceipt: true});
});
// ACK/receipt only after durable commit; pending requests still suppress receipts.
```

`createDraftSignalStore`, `encryptAllTargetDevices`, and `decryptAndValidate` above are adapter boundaries to implement and test, not functions already present in this repository. Never hold an IndexedDB transaction open across asynchronous cryptography/network awaits; it can auto-close. Read a draft, do cryptography, then atomically write the prepared sealed result while holding the single-writer lock. On unsupported Web Locks platforms use a single dedicated Worker leader or disable that device enrollment; do not allow parallel ratchet writers. [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API), [IndexedDB transactions](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB).

Auto-lock on explicit user action/account switch and configurable inactivity; clear decrypted React caches, object URLs, Workers, and sockets. Cross-tab lock via BroadcastChannel. Locked tabs may persist opaque inbound ciphertext to a bounded queue but must not claim decryption/read. JavaScript zeroization and non-extractable keys do not defeat active same-origin XSS; unlocked code can call decrypt or intercept plaintext.

### React transport and silent preview

Expose one MessagingContext with `{locked, conversations, inbox, requests, send, accept, reject, markVisible}`. Keep plaintext out of Next.js Server Components, SSR, analytics, service worker caches, URLs, browser notifications, and application logging. Account/device changes recreate the context and destroy old socket listeners/vault handles.

```tsx
function useMessaging(socket: Socket, engine: MessagingEngine) {
  useEffect(() => {
    let closed = false;
    const onMessage = async (wire: IncomingEnvelope) => {
      try {
        const result = await engine.decryptAndCommit(wire);
        if (closed) return;
        engine.refreshLocalProjection(result.conversationId);
        // Even if the client cache is wrong, the relay independently suppresses.
        if (engine.state(result.conversationId) === 'ACCEPTED')
          await engine.queueReceipt('DELIVERED', [wire.messageId]);
      } catch {engine.showDecryptFailure(wire.messageId);} // No secret logging.
    };
    const onAccepted = async (event: ConversationChanged) => {
      await engine.applyServerState(event);
      await engine.flushPendingReceipts(event.conversationId);
    };
    socket.on('message:new', onMessage);
    socket.on('conversation:changed', onAccepted);
    void engine.resumeByCursorAndReplayOutbox();
    return () => {closed = true; socket.off('message:new', onMessage);
      socket.off('conversation:changed', onAccepted);};
  }, [socket, engine]);
}
```

The referenced engine interfaces describe integration duties; implement their persistence and validation using the vault contract. On `markVisible`, require unlocked vault, `document.visibilityState === 'visible'`, and actual intersection/user opening before recording locallyRead. Pending previews record this flag locally and emit nothing. On acceptance submit bounded exact delivered/read ID sets, then flush remaining batches under the accepted epoch. Acceptance does not mean every queued message was read. Never store pending preview read IDs on the server before acceptance.

Typing/presence gating belongs centrally in the engine AND relay, not scattered only in React component effects. Render requests without remote avatars/images fetched from arbitrary URLs, remote HTML, link unfurling, third-party embeds, or presence probes. No push receipt/analytics callback or exposed last-active changes caused by preview. Decrypt locally as needed but defer attachment downloads until acceptance or an explicit privacy-aware download action: sender-controlled media and access logs otherwise create a side channel.

### Attachments

Use `kwonweb/docs/e2ee/attachments.ts`: fresh AES-256 key for EACH blob, fresh 96-bit IV, AES-GCM tag, and conversation/blob-bound associated data. Encrypt files and thumbnails before upload. Carry the key, IV, safe filename, MIME, dimensions/duration, and ciphertext hash only inside the ratchet payload. The sample bounds in-memory encryption to 20 MiB; a real large-file uploader needs an independently reviewed chunk protocol with unique nonce per chunk and an authenticated manifest covering ordering/truncation, not repeated GCM nonces. [Web Crypto AES-GCM](https://www.w3.org/TR/webcrypto/).

Flow: reserve opaque blob ID -> encrypt -> upload ciphertext with `application/octet-stream` -> finalize stored byte count/hash -> ratchet-send descriptor. Network operations happen outside ratchet transactions. Interrupted/unreferenced blobs expire. Prefer opaque IDs resolved to short-lived authenticated download grants, not permanent public CDN URLs. Blob descriptors must never permit arbitrary fetch URLs.

Before decrypting, bound downloaded bytes and validate the descriptor schema. After decrypting, allowlist MIME AND sniff actual file signatures; MIME from a peer is untrusted. Show media via local object URLs; revoke them when unmounted/locked. Download PDF/other files rather than execute active content. Do not inline SVG/HTML or render unsanitized message HTML. Server thumbnailing, OCR, virus scanning of plaintext, and content moderation are incompatible with server-blind attachment E2EE; use client controls and explicit user-consented abuse reports.

## 4. Node.js relay, transactions and socket controller

### Authentication and routing

Keep existing `validateAuthSession` and session revocation/disconnect behavior. Add device-bound socket enrollment verification: the session must own the active device and prove possession of its enrollment signing key using a fresh single-use server challenge. Do not accept `deviceId` alone as proof. Validate Origin against an exact allowlist; HTTPS/WSS only; bound frame size; periodically revalidate sessions.

Only the server joins `device:<enrolledUuid>` rooms. Never expose arbitrary `room:join`. Conversation rooms require a membership check on each join, and pending-request broadcasts must not use shared conversation rooms. A user authenticated to the app is not automatically entitled to every conversation.

Transport stays thin and business rules remain in the existing conversation service:

```ts
// src/socketIo/convoSocketIo.ts integration excerpt
// Schemas are strict Zod definitions of the contracts above.
function bindMessaging(socket: AuthenticatedDeviceSocket) {
  const actor = socket.data.actor; // Server-verified {userId, deviceId, sessionId}.
  const handle = (schema: ZodSchema, action: (actor: Actor, body: any) => Promise<unknown>) =>
    async (input: unknown, ack: (reply: unknown) => void) => {
      if (typeof ack !== 'function') return;
      try {
        await requireLiveSession(actor); // Existing validateAuthSession, plus device status.
        const parsed = schema.parse(input);
        await enforceEventQuota(actor, parsed); // Redis-backed, bounded and fail closed.
        ack({ok: true, data: await action(actor, parsed)});
      } catch (error) {
        logServiceError('conversations', 'socketCommand', error);
        ack({ok: false, error: 'Unable to process messaging operation'});
      }
    };
  socket.on('message:send', handle(SendSchema, relayEncryptedMessage));
  // Compatibility aliases: same opaque send pipeline, not direct SQL text mutations.
  socket.on('reaction:add', handle(SendSchema, relayEncryptedMessage));
  socket.on('message:edit', handle(SendSchema, relayEncryptedMessage));
  socket.on('message:delete', handle(SendSchema, relayEncryptedMessage));
  socket.on('message:delivered', handle(ReceiptSchema, (a, b) => recordReceipt(a, b, 'DELIVERED')));
  socket.on('message:read', handle(ReceiptSchema, (a, b) => recordReceipt(a, b, 'READ')));
  socket.on('request:accept', handle(AcceptSchema, acceptRequest));
  socket.on('typing:start', handle(TypingSchema, (a, b) => publishTyping(a, b, true)));
  socket.on('typing:stop', handle(TypingSchema, (a, b) => publishTyping(a, b, false)));
}
```

`AuthenticatedDeviceSocket`, actor challenge enrollment, validators, quota functions, and service functions are required integration adapters. There are no bypass routes: HTTP history reads, bulk receipt updates, push workers, bootstrap ACKs, and socket handlers must use the same authorization/policy service. Never include decrypted JSON, key bundles, file keys, access tokens, envelope bodies, or user IPs in logs. Log safe message IDs, command IDs, timing, and sanitized errors.

### Encrypted send and idempotency

Implement `relayEncryptedMessage` as a Prisma transaction:

1. Acquire a transaction advisory lock for the canonical user pair, then lock the conversation row. All request/contact/block changes must acquire the same locks in the same order. Recheck membership, actor device ownership and revocation, both block directions, request eligibility and quotas **inside** the transaction.
2. Compare the current registered target roster against the input. Validate recipient devices plus sender's sibling devices; reject revoked/foreign/missing target devices. A roster change must not cause retries to encrypt under the same old client ID.
3. Calculate a canonical request digest, excluding transport-only retry timestamps. Upsert/find the unique `(senderDeviceId, clientId)`. If the prior digest matches, return its prior message ID/sequence; if bytes differ, reject the ID reuse. Use a unique constraint plus lock to handle simultaneous requests.
4. Persist the logical `E2Message`, all envelopes, and one `E2Outbox` row per targeted device in the same transaction. Public acceptance ACK returns only stored status, not receiver socket presence or delivery count.
5. Emit AFTER commit through an outbox worker. A crash between commit and send is recoverable. Duplicate emission is normal; clients dedupe IDs before ratchet decryption.

For pending requests limit initial messages and attachments, use a private recipient folder, prohibit bidirectional conversation activity until acceptance, and return sender-facing status SENT regardless of local download/decrypt. Do not expose sender-visible recipient fetch/download counters, last-message-read timestamps, request-preview changes, or request-specific socket connection errors. Suppress sender-facing bootstrap session acknowledgments as well.

### Receipt gate: apply it on the server

```ts
// src/services/v1/conversations/index.ts integration excerpt
async function recordReceipt(actor: Actor, input: ReceiptCommand,
  status: 'DELIVERED' | 'READ') {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<E2Conversation[]>`
      SELECT * FROM "E2Conversation" WHERE id = ${input.conversationId}::uuid FOR UPDATE`;
    const c = rows[0];
    if (!c) throw new Error('Conversation unavailable');
    await requireMemberAndActiveDevice(tx, c.id, actor); // No client userId/deviceId authority.
    // A pending request must not record receipt data or emit ANY sender-visible event.
    if (c.state !== 'ACCEPTED' || c.epoch !== input.expectedEpoch)
      return {accepted: false}; // Receiver-private acknowledgment only.
    await requirePairUnblocked(tx, c);
    for (const messageId of [...new Set(input.messageIds)]) {
      const envelope = await tx.e2Envelope.findUnique({
        where: {messageId_recipientDeviceId: {messageId, recipientDeviceId: actor.deviceId}},
        include: {message: {include: {senderDevice: true}}},
      });
      if (!envelope || envelope.message.conversationId !== c.id ||
          envelope.message.senderDevice.userId === actor.userId)
        throw new Error('Receipt unavailable');
      const now = new Date();
      const previous = await tx.e2Receipt.findUnique({where: {
        messageId_recipientDeviceId: {messageId, recipientDeviceId: actor.deviceId},
      }});
      if (previous?.status === 'READ' || previous?.status === status) continue;
      await tx.e2Receipt.upsert({
        where: {messageId_recipientDeviceId: {messageId, recipientDeviceId: actor.deviceId}},
        create: {messageId, recipientDeviceId: actor.deviceId, status, deliveredAt: now,
          readAt: status === 'READ' ? now : null},
        update: {status, ...(status === 'READ' ? {readAt: now} : {})},
      });
      // Queue to original sender's active devices; exclude own-device delivery from aggregate.
      // For first READ queue DELIVERED before READ; receiver never forces an older state.
      await enqueueReceiptEvents(tx, c, envelope.message, previous, status);
    }
    return {accepted: true};
  });
}
```

All messages in a bounded batch must pass before commit; transaction rollback prevents partial spoofed receipts. The global pair lock/block lock order used in other operations must also be respected around this excerpt. Only serialize operations under the conversation lock if every competing accept/block/send/receipt path uses that lock. [PostgreSQL row locking](https://www.postgresql.org/docs/current/sql-select.html).

Default user-facing aggregate: READ if any genuine recipient device reports READ; otherwise DELIVERED if any reports DELIVERED; otherwise SENT. Pending sender view always overrides aggregate to SENT. READ never downgrades to DELIVERED. Receipt timestamps are server receipt times, not exact private preview times; release pending previews using the acceptance time. Other account devices synchronize through encrypted own-device events, not sender-facing receipts.

Encrypted receipt payloads provide recipient authentication if the server itself is adversarial: send a ratcheted `kind:'receipt'` event after acceptance in addition to the relay hints, and let the sender trust the validated encrypted receipt. Without this, an authenticated relay can fabricate plaintext status events. Server-side suppression protects pending previews against ordinary clients, but a malicious server can still forge UI hints; document that trust boundary.

### Acceptance, rejection and block

`acceptRequest(actor, input)` uses the same pair/conversation lock and is idempotent by command ID:

- Only `approverId` may transition the pending request. Confirm the authenticated device belongs to that account and the pair is unblocked. Do not accept a client `recipientId` as authority.
- Require every supplied ID to reference an envelope addressed to the actor's device in this conversation. Restrict incoming sender messages, not the approver's own sync envelopes. Deduplicate; read IDs must be a subset of delivered IDs (or union them into the delivered set).
- Transition to ACCEPTED and increment epoch. Apply receipt rows for ONLY supplied processed/viewed messages, enqueue ordered DELIVERED/READ status events, and write receiver conversation-change events in the SAME transaction.
- Large previews flush in subsequent bounded receipt batches after acceptance; acceptance must not decrypt or mark the entire history read on the relay.
- Persist idempotency results so duplicate acceptance with the original expected epoch returns the committed result. Recheck policy when dispatching outbox entries; never release stale receipts after block/reject.

Reject: privately mark request rejected, increment epoch, stop recipient fanout, delete recipient pending envelopes and associated download grants, and purge local conversation cache, attachment keys, pending inbox/outbox and conversation-session state. Do not delete the device identity or all prekeys: they are shared with other contacts. If sessions are shared across multiple conversations with the same peer, maintain references and retire only when safe. Keep a minimal replay/suppression tombstone to prevent replay/reinitialization; key deletion does not delete the sender's retained plaintext.

Block: add a pair-level block, transition server state to BLOCKED, increment epoch, revoke conversation download grants, cancel queued typing/receipt/push events, and purge as above. Other receiver devices get a receiver-private block/purge command. Define device acknowledgment/offline cleanup behavior. Sender must not receive a “request rejected” or “recipient blocked you” event. Their public status stays SENT. A BLOCKED server record is projected privately; avoid exposing it to the sender through list/history endpoints.

Silently rejecting and rejecting with an explicit error have different metadata effects. If hiding rejection is a product promise, future sends should receive a uniform sender-facing submission response and minimal sender-only tombstone history under the same quotas, while being discarded for the recipient. Avoid unbounded dummy ciphertext retention. This minimizes direct disclosure; timing/quota patterns can still reveal state, so do not claim perfect indistinguishability.

Typing delivery: recheck accepted state, matching epoch, ownership and blocks for every emission; include a short TTL and conversation epoch. Client discards stale epochs/expired events. Presence is a separate privacy preference and should not be inferred merely from a conversation socket. A user who globally publishes presence elsewhere can still leak activity; request-view privacy requires those app-wide channels to respect the same contact policy.

### Atomic prekey claims

Claims must be authenticated, authorized, rate-limited and idempotent by `(requestingDevice, claimId, recipientDevice)`. No account/device “last active” side effect is exposed to peers. Within one database transaction, verify active enrollment, load the latest signed prekey, and reserve exactly one OPK:

```sql
WITH selected AS (
  SELECT "deviceId", "keyId" FROM "E2OneTimePreKey"
  WHERE "deviceId" = $1 AND "claimedAt" IS NULL
  ORDER BY "keyId" LIMIT 1 FOR UPDATE SKIP LOCKED
)
UPDATE "E2OneTimePreKey" k
SET "claimedAt" = NOW(), "claimId" = $2, "claimedByDeviceId" = $3
FROM selected s
WHERE k."deviceId" = s."deviceId" AND k."keyId" = s."keyId"
RETURNING k."keyId", k."publicKey";
```

Serialize duplicate claims with an advisory lock or unique claim registry so two retries cannot consume two keys. Retain public claim results for retry; this table contains no private keys. Locally consume/delete a private OPK only inside a successful decrypt transaction, not when a directory bundle is fetched. Replenish below a threshold, retain old private signed prekeys for the bounded delayed-message window, and never reuse OPK IDs. Exhaustion policy must be explicit: allow the protocol's signed-prekey-only fallback with its security tradeoff, or defer new sessions and request replenishment; do not invent a fallback key. Pending requests must not require a sender-observable replenishment/session-success ACK. [X3DH prekeys](https://signal.org/docs/specifications/x3dh/).

### Outbox, reconnect and attachment relay

Outbox worker: claim with `FOR UPDATE SKIP LOCKED`, lease, commit, dispatch using a shared Redis Socket.IO adapter, then mark published. Renew leases for long work, recover expired leases, bound retries, and retain dead letters with safe error codes. Deduplication keys include event/message/device. Recheck active recipient devices and current conversation epoch/state before sending receipts/typing. A process-local room map cannot serve multiple API replicas reliably.

Socket.IO does not give durable server-to-client history automatically. Provide an authenticated per-device ciphertext sync endpoint using server sequence cursors, retention bounds and stable pagination. Never advance a cursor before local commit; sync resumes after ACK loss/reconnect; old client sends replay exact saved ciphertext. Preserve sync tombstones so dropped/purged events do not lead to infinite retries. A receipt event missed live must be discoverable by a status snapshot or durable own-device sync. Authenticate every catch-up read.

Attachment upload/download endpoints remain controllers in the existing conversation domain with storage helpers behind the service:

- Reserve random server-owned object keys. Do not let clients choose another conversation's object path.
- Enforce actor/conversation membership, quotas, allowed states, block policy, maximum encrypted byte count, checksum, grant expiry and finalize state.
- Upload only ciphertext. Use private S3/R2 storage, short-lived scoped PUT/GET grants, restrictive CORS and no plaintext filename in object keys/Content-Disposition/logs.
- A presigned grant remains valid until its expiry even after a block. For immediate revocation use an authenticated proxy or short TTL and state the residual window.
- Do not use public `media.kwonnet.com` objects for encrypted private chat attachments without an authorization redesign.
- In pending preview, disable automatic download/unfurl and sender-visible blob fetch counters. An honest private proxy can hide recipient identity from the sender; the relay/CDN itself can still observe fetch metadata.
- Garbage-collect abandoned uploads and expired ciphertext. CDN/cache invalidation does not revoke copies already downloaded.

## 5. Security, operations and staged delivery

“Zero-leak preview” means no sender-visible application events caused by preview under the stated honest-relay policy. E2EE does not conceal IP addresses, pair membership, device counts, timing, message sizes or storage access from the relay/CDN. Padding, batching, privacy-preserving directory lookup, and proxying reduce some metadata but do not provide Signal's full metadata threat model automatically.

| Threat | Required mitigation |
|---|---|
| Sender spoofs another identity/device or joins a foreign room | Authenticated actor + possession challenge; per-command authorization; no arbitrary room joins |
| Pending preview leaks read/delivery/typing | Central locked state gate on all socket/HTTP/push/bootstrap/presence paths; no implicit delivery on socket ACK |
| Malicious key directory substitutes identities | Fingerprints/safety numbers, explicit identity-change approval, transparent enrollment/key history; TOFU limitation documented |
| Ratchet fork/reuse after crash or multiple tabs | Single writer, atomic ratchet+outbox / ratchet+inbox commit, exact ciphertext retries, restore into new device identity |
| Replay, edits from another author, late reaction after delete | IDs, transcript/context binding, author checks, revision hashes, persistent encrypted tombstones |
| Prekey harvesting/exhaustion | Rate limits, quotas, atomic idempotent claims, public-only exports, private-key retention/rotation |
| Offline passcode guessing | Argon2id, strong passphrase or platform-bound secret; no claim that UI PIN throttling prevents offline attacks |
| XSS or compromised web release | Strict CSP/Trusted Types, no third-party scripts on messaging surfaces, no unsafe HTML, dependencies/release integrity review |
| Media beacon/active content/huge ciphertext | Opaque authorized IDs, no arbitrary URLs or automatic pending downloads, byte limits, client MIME sniffing, safe renderer |
| Leaky notifications/logs/backups | Generic push text, no preview content/keys, sanitized operational IDs, encrypted backups with explicit recovery semantics |
| Stale events after rejection/block | Epoch checks at enqueue and dispatch, durable cancellation/purge tombstones, receiver-device propagation |
| Session/device revocation | Disconnect sockets, revoke device grants, stop future roster inclusion, recheck catch-up and commands; copied old plaintext remains |

Signed deletion, device verification, and ratchet trust are distinct. Account email/Google verification establishes account login; it does not verify a peer's encryption identity. Keep those UI labels distinct. A new device cannot decrypt historical messages unless existing devices explicitly transfer an encrypted archive; a server password reset cannot recover message keys.

Implementation order:

1. **Contain current relay issues:** authenticate joins and senders, validate device ownership/recipient membership, gate all request receipts, add block-policy checks and limits before adding new features.
2. **Version the wire protocol:** negotiate a new capability; reject downgrade; preserve old ciphertext in a separate legacy path. Do not attempt to decrypt old custom-sodium messages with Signal or silently reset keys.
3. **Introduce the schema:** map existing users, compound membership uniqueness, versioned device enrollment, OPK claim registry, immutable messages/envelopes, receipt rows, blob grants and transactional outbox. Backfill conversations separately from ciphertext envelopes.
4. **Implement vault + Signal adapter:** public-only enrollment, pinned identities, multi-device roster, passphrase UX, session/OPK transactional adapter, persisted outbox/inbox and locking. Test with known protocol vectors and two independent browser devices.
5. **Migrate relay and sync:** store/fanout ciphertext to device rooms, device cursors, idempotent retry and receipt replay; Redis shared adapter and workers.
6. **Enforce Requests:** private folder/projections, silent decrypt/preview, no bootstrap ACK, accepted-epoch status release only for locally processed/read IDs, reject/block purge and tombstones.
7. **Implement encrypted actions and media:** local projection reducer, original-author validation, edits/reactions/replies, deletion policy, opaque blob relay and client decrypt/render.
8. **Add recovery/locking UI and security review:** device list/revoke, identity-change warnings, recovery-key consent, password-reset key-loss explanations, notification privacy settings.
9. **Canary and cut over:** dual-read with explicit protocol routing, no plaintext dual-write, old-key retention policy, feature flag/canary devices, rollback plan preserving key/session state. Retire legacy protocol only after client adoption and retention expiry.

Required validation before rollout:

- Pending HTTP fetch, socket delivery, decrypt, preview, refresh, reconnect, attachment preview and session bootstrap generate NO sender-facing receipts/typing/presence/state changes. Test another sender device as well as another account.
- Acceptance releases only exact processed/viewed IDs; repeated accepts and crossed accept/block/send transactions are idempotent and leak no stale status.
- Wrong-member/device receipts, arbitrary room joins, foreign envelopes, stale epochs, forged sender IDs and replayed signed deletes fail.
- Read implies delivered; reconnect/replay never downgrades status. Own-device sync does not mark a peer's delivery.
- Two tabs, offline devices, simultaneous first messages, out-of-order/skipped keys, OPK exhaustion and key rotations work without ratchet forks.
- Crash before/after local commit, server commit, queue publication and socket ACK cannot lose a committed message or reuse an encryption operation under the same idempotency key.
- Invalid payload/authentication leaves ratchet/session/OPK state unchanged. Simulate IndexedDB quota failures and browser termination.
- Every enrollment/export/log/back-up schema rejects private keys. Identity changes stop encryption until approval.
- Attachment tamper, wrong conversation/blob AAD, invalid nonce/key/length, oversized blobs and active MIME content are rejected. No public media path exposes original content.
- Vault lock/account switch destroys live plaintext projections/URLs and prevents crypto operations; browser/server analytics contain no decrypted content.
- Device revocation and block propagate across API replicas, workers and offline receiver devices.

Operational metrics: queue lag, ciphertext storage commit latency, outbox retries/leases, reconnect catch-up size, generic decrypt failure counts, prekey pool levels, vault quota failures, and policy-denied counts. Never label metrics with plaintext, passphrases, tokens, ratchet keys, file keys, or full per-user identifiers. Production debug logging cannot bypass redaction.

Reference artifacts:

- `kwonserver/docs/e2ee/schema.prisma`: relational design, not an applied migration.
- `kwonweb/docs/e2ee/attachments.ts`: bounded AES-GCM file helper.
- `kwonweb/docs/e2ee/vault.ts`: account/device-scoped encrypted atomic snapshot helper.
- `kwonweb/docs/e2ee/signal.ts`: complete Signal draft store and atomic encrypt/decrypt adapter.
- `kwonweb/docs/e2ee/attachments.test.cjs`: run with `node --test docs/e2ee/attachments.test.cjs` from kwonweb.

These examples supply reviewed integration patterns and compile-time checks, not an audited complete Signal application. Do not market the current custom X3DH path as standards-conformant until it is replaced or independently validated.
