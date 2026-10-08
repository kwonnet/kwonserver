import logger from '@/logger';
import { publishMessagingHints } from './live';
import * as objects from './storage';
import { getPublicUser, composeAuthUser } from "../utils";
import db from '@/db';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { EnrollInput, SendInput, ReceiptInput, ReceiptBatchInput } from './e2ee-contracts';
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest();
const b64 = (value: Uint8Array) => Buffer.from(value).toString('base64');
export class MessagingError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
type Tx = Prisma.TransactionClient;
async function actorLock(tx: Tx, userId: string) { await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${`e2:${userId}`}))`; }
async function conversationLock(tx: Tx, id: string) { await tx.$queryRaw `SELECT id FROM "E2Conversation" WHERE id = ${id}::uuid FOR UPDATE`; }
export async function messagingDevice(userId: string, sessionId: string, deviceId: string, tx: Tx = db) {
    const device = await tx.e2Device.findFirst({ where: { id: deviceId, userId, sessionId, revokedAt: null } });
    if (!device)
        throw new MessagingError(403, 'Unlock and enroll this messaging device first');
    return device;
}
async function membership(tx: Tx, conversationId: string, userId: string) {
    const convo = await tx.e2Conversation.findFirst({ where: { id: conversationId, members: { some: { userId } } }, include: { members: true } });
    if (!convo)
        throw new MessagingError(404, 'Conversation not found');
    return convo;
}
async function blocked(tx: Tx, a: string, b: string) {
    return !!await tx.blockUser.findFirst({ where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] }, select: { id: true } });
}
export async function enrollMessagingDevice(userId: string, sessionId: string, input: EnrollInput) {
    const keys = input.preKeys.map(key => ({ keyId: key.keyId, publicKey: Buffer.from(key.publicKey, 'base64') }));
    if (new Set(keys.map(key => key.keyId)).size !== keys.length)
        throw new MessagingError(400, 'Duplicate prekey IDs');
    return db.$transaction(async (tx) => {
        await actorLock(tx, userId);
        const existing = await tx.e2Device.findUnique({ where: { id: input.deviceId } });
        if (existing && (existing.userId !== userId || existing.revokedAt || !timingSafeEqual(Buffer.from(existing.identityPublic), Buffer.from(input.identityPublic, 'base64')) || b64(existing.actionSigningPublic) !== input.actionSigningPublic || existing.registrationId !== input.registrationId || existing.signalDeviceId !== input.signalDeviceId))
            throw new MessagingError(409, 'Device identity cannot be replaced; enroll a new device');
        if (!existing && await tx.e2Device.count({ where: { userId, revokedAt: null } }) >= 10)
            throw new MessagingError(409, 'Revoke an old device before adding another');
        const previous = await tx.e2SignedPreKey.findUnique({ where: { deviceId_keyId: { deviceId: input.deviceId, keyId: input.signedPreKey.keyId } } });
        if (previous && (b64(previous.publicKey) !== input.signedPreKey.publicKey || b64(previous.signature) !== input.signedPreKey.signature))
            throw new MessagingError(409, 'Signed prekey ID cannot be reused');
        await tx.e2Device.upsert({ where: { id: input.deviceId }, create: { id: input.deviceId, userId, sessionId, signalDeviceId: input.signalDeviceId, registrationId: input.registrationId, identityPublic: Buffer.from(input.identityPublic, 'base64'), actionSigningPublic: Buffer.from(input.actionSigningPublic, 'base64') }, update: { sessionId } });
        await tx.e2SignedPreKey.updateMany({ where: { deviceId: input.deviceId, keyId: { not: input.signedPreKey.keyId }, retiredAt: null }, data: { retiredAt: new Date() } });
        await tx.e2SignedPreKey.upsert({ where: { deviceId_keyId: { deviceId: input.deviceId, keyId: input.signedPreKey.keyId } }, create: { deviceId: input.deviceId, keyId: input.signedPreKey.keyId, publicKey: Buffer.from(input.signedPreKey.publicKey, 'base64'), signature: Buffer.from(input.signedPreKey.signature, 'base64') }, update: {} });
        if (keys.length) {
            // One read and one insert for the entire bundle, rather than 2N round trips.
            const stored = await tx.e2OneTimePreKey.findMany({
                where: { deviceId: input.deviceId, keyId: { in: keys.map(key => key.keyId) } },
                select: { keyId: true, publicKey: true },
            });
            const existingKeys = new Map(stored.map(key => [key.keyId, key.publicKey]));
            for (const key of keys) {
                const old = existingKeys.get(key.keyId);
                if (old && !Buffer.from(old).equals(key.publicKey))
                    throw new MessagingError(409, 'Prekey ID cannot be reused');
            }
            const fresh = keys.filter(key => !existingKeys.has(key.keyId));
            if (fresh.length)
                await tx.e2OneTimePreKey.createMany({ data: fresh.map(key => ({ deviceId: input.deviceId, ...key })) });
        }
        return { deviceId: input.deviceId };
    }, { maxWait: 5000, timeout: 15000 });
}
export async function messagingRoster(viewerId: string, recipientId: string) {
    if (await blocked(db, viewerId, recipientId))
        return [];
    return (await db.e2Device.findMany({ where: { userId: recipientId, revokedAt: null }, select: { id: true, userId: true, signalDeviceId: true, identityPublic: true, actionSigningPublic: true } })).map(d => ({ ...d, deviceId: d.id, identityPublic: b64(d.identityPublic), actionSigningPublic: b64(d.actionSigningPublic) }));
}
export async function claimMessagingPreKey(userId: string, sessionId: string, requesterDeviceId: string, targetDeviceId: string, claimId: string) {
    return db.$transaction(async (tx) => {
        const requester = await messagingDevice(userId, sessionId, requesterDeviceId, tx);
        await actorLock(tx, userId);
        const old = await tx.e2PreKeyClaim.findUnique({ where: { id: claimId } });
        if (old) {
            if (old.requesterDeviceId !== requester.id || old.targetDeviceId !== targetDeviceId)
                throw new MessagingError(409, 'Claim conflict');
            return old.bundle;
        }
        const target = await tx.e2Device.findFirst({ where: { id: targetDeviceId, revokedAt: null } });
        if (!target || await blocked(tx, userId, target.userId))
            throw new MessagingError(404, 'Device unavailable');
        const count = await tx.e2PreKeyClaim.count({ where: { requesterDeviceId, createdAt: { gte: new Date(Date.now() - 3600000) } } });
        if (count >= 200)
            throw new MessagingError(429, 'Too many prekey claims');
        const signed = await tx.e2SignedPreKey.findFirst({ where: { deviceId: target.id, retiredAt: null }, orderBy: { createdAt: 'desc' } });
        if (!signed)
            throw new MessagingError(409, 'Device not ready');
        const keys = await tx.$queryRaw<{
            keyId: number;
            publicKey: Uint8Array;
        }[]> `UPDATE "E2OneTimePreKey" SET "claimedAt"=now(),"claimId"=${claimId}::uuid,"claimedByDeviceId"=${requester.id}::uuid WHERE ("deviceId","keyId") IN (SELECT "deviceId","keyId" FROM "E2OneTimePreKey" WHERE "deviceId"=${target.id}::uuid AND "claimedAt" IS NULL ORDER BY "keyId" LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING "keyId","publicKey"`;
        const bundle = { registrationId: target.registrationId, identityKey: b64(target.identityPublic), signedPreKey: { keyId: signed.keyId, publicKey: b64(signed.publicKey), signature: b64(signed.signature) }, ...(keys[0] ? { preKey: { keyId: keys[0].keyId, publicKey: b64(keys[0].publicKey) } } : {}) };
        await tx.e2PreKeyClaim.create({ data: { id: claimId, requesterDeviceId: requester.id, targetDeviceId: target.id, bundle } });
        return bundle;
    });
}
export async function createMessagingConversation(userId: string, recipientId: string) {
    if (userId === recipientId)
        throw new MessagingError(400, 'Choose another user');
    return db.$transaction(async (tx) => {
        const pairKey = digest(['kwonnet-direct-v2', ...[userId, recipientId].sort()]).toString('hex');
        await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${pairKey}))`;
        const old = await tx.e2Conversation.findUnique({ where: { pairKey }, include: { members: true } });
        if (old)
            return messagingConversationDTO(old, userId);
        if (await blocked(tx, userId, recipientId))
            throw new MessagingError(404, 'Conversation unavailable');
        const target = await tx.user.findFirst({ where: { id: recipientId, deletedAt: null, deactivatedAt: null }, select: { id: true } });
        if (!target)
            throw new MessagingError(404, 'User unavailable');
        const mutual = await tx.follow.count({ where: { status: 'ACCEPTED', OR: [{ followerId: userId, followingId: recipientId }, { followerId: recipientId, followingId: userId }] } }) === 2;
        const created = await tx.e2Conversation.create({ data: { pairKey, initiatorId: userId, approverId: recipientId, state: mutual ? 'ACCEPTED' : 'PENDING_REQUEST', acceptedAt: mutual ? new Date() : null, members: { create: [{ userId }, { userId: recipientId }] } }, include: { members: true } });
        return messagingConversationDTO(created, userId);
    });
}
function messagingConversationDTO(c: any, viewerId: string) {
    // Rejection/block are private to the approver. Sender sees their unchanged request.
    const accepted = !!c.acceptedAt;
    return { id: c.id, kind: 'chat', state: accepted ? 'ACCEPTED' : 'PENDING_REQUEST', epoch: c.epoch, initiator: { id: c.initiatorId, acceptedAt: c.createdAt, isPaid: false }, responder: { id: c.approverId, acceptedAt: c.acceptedAt, isPaid: false }, unreadCount: c.members?.find((m: any) => m.userId === viewerId)?.unreadCount ?? 0, unseenCount: c.members?.find((m: any) => m.userId === viewerId)?.unseenCount ?? 0, createdAt: c.createdAt, updatedAt: c.createdAt };
}
export async function listMessagingConversations(userId: string, kind: string, page: number, limit: number) {
    const rows = await db.e2Conversation.findMany({ where: { members: { some: { userId, hiddenAt: null } }, ...(kind === 'requests' ? { approverId: userId, acceptedAt: null, rejectedAt: null } : { OR: [{ acceptedAt: { not: null } }, { initiatorId: userId }] }) }, include: { members: true, messages: { take: 1, orderBy: { serverSequence: 'desc' } } }, orderBy: { createdAt: 'desc' }, take: Math.min(limit, 100), skip: Math.max(0, page - 1) * limit });
    const ids = [...new Set(rows.flatMap(c => [c.initiatorId, c.approverId]))];
    const profiles = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, relationLoadStrategy: 'join', include: { subscriptions: { where: { status: { in: ['ACTIVE', 'TRIAL', 'PAYMENT_ERROR'] } } }, country: { select: { id: true, name: true, iso2: true, iso3: true, emoji: true, continentId: true } } } }) : [];
    const users = new Map(profiles.map(profile => [profile.id, composeAuthUser(profile, false)]));
    return rows.map(c => { const dto = messagingConversationDTO(c, userId), a = users.get(c.initiatorId), b = users.get(c.approverId); if (!a || !b)
        throw new MessagingError(404, 'Conversation participant unavailable'); return { ...dto, initiator: { ...dto.initiator, user: a }, responder: { ...dto.responder, user: b } }; });
}
export async function messagingPeer(userId: string, recipientId: string) {
    const pairKey = digest(['kwonnet-direct-v2', ...[userId, recipientId].sort()]).toString('hex');
    const c = await db.e2Conversation.findUnique({ where: { pairKey }, include: { members: true } });
    return { recipient: await getPublicUser(recipientId), recipientDevices: await messagingRoster(userId, recipientId), convo: c ? messagingConversationDTO(c, userId) : undefined, messages: [] };
}
export async function sendMessagingEvent(userId: string, sessionId: string, deviceId: string, input: SendInput) {
    const result = await db.$transaction(async (tx) => {
        const sender = await messagingDevice(userId, sessionId, deviceId, tx);
        await conversationLock(tx, input.conversationId);
        const convo = await membership(tx, input.conversationId, userId);
        const canonical = { ...input, envelopes: [...input.envelopes].sort((a, b) => a.recipientDeviceId.localeCompare(b.recipientDeviceId)) };
        const hash = digest(canonical);
        const previous = await tx.e2Message.findUnique({ where: { senderDeviceId_clientId: { senderDeviceId: deviceId, clientId: input.clientId } } });
        if (previous) {
            if (!timingSafeEqual(Buffer.from(previous.requestDigest), hash))
                throw new MessagingError(409, 'Message ID reused with different ciphertext');
            return { messageId: previous.id, status: 'SENT', serverSequence: String(previous.serverSequence) };
        }
        if (convo.state === 'PENDING_REQUEST' && userId !== convo.initiatorId)
            throw new MessagingError(403, 'Accept this request before replying');
        const peer = convo.members.find(m => m.userId !== userId)!;
        const discard = !!convo.rejectedAt || convo.state === 'BLOCKED' || await blocked(tx, userId, peer.userId);
        if (discard)
            return { messageId: input.clientId, status: 'SENT', serverSequence: '0' };
        const recent = await tx.e2Message.count({ where: { senderDeviceId: sender.id, createdAt: { gte: new Date(Date.now() - 60000) } } });
        if (recent >= 60)
            throw new MessagingError(429, 'Too many messages');
        if (convo.state === 'PENDING_REQUEST' && await tx.e2Message.count({ where: { conversationId: convo.id } }) >= 10)
            throw new MessagingError(429, 'Wait for this request to be accepted');
        const roster = await tx.e2Device.findMany({ where: { userId: { in: convo.members.map(m => m.userId) }, revokedAt: null, id: { not: deviceId } }, select: { id: true, userId: true } });
        const targetIds = input.envelopes.map(e => e.recipientDeviceId);
        if (new Set(targetIds).size !== targetIds.length || targetIds.some(id => !roster.some(d => d.id === id)) || roster.some(d => !targetIds.includes(d.id)) || !roster.some(d => d.userId === peer.userId))
            throw new MessagingError(409, 'Device roster changed; refresh before sending');
        const msg = await tx.e2Message.create({ data: { conversationId: convo.id, senderDeviceId: deviceId, clientId: input.clientId, requestDigest: hash, expiresAt: new Date(Date.now() + 90 * 86400000), envelopes: { createMany: { data: input.envelopes.map(e => ({ recipientDeviceId: e.recipientDeviceId, wireType: e.wireType, ciphertext: Buffer.from(e.ciphertextB64, 'base64') })) } }, deliveries: { create: { conversationId: convo.id, userId: peer.userId } } } });
        await tx.e2Member.update({ where: { conversationId_userId: { conversationId: convo.id, userId: peer.userId } }, data: { unreadCount: { increment: 1 }, unseenCount: { increment: 1 } } });
        await tx.e2Outbox.createMany({ data: input.envelopes.map(envelope => ({ dedupeKey: `message:${msg.id}:${envelope.recipientDeviceId}`, conversationId: convo.id, targetDeviceId: envelope.recipientDeviceId, expectedEpoch: convo.epoch, event: 'message', payload: { conversationId: convo.id } })) });
        return { messageId: msg.id, status: 'SENT', serverSequence: String(msg.serverSequence) };
    });
    wakeMessagingRelay(input.conversationId);
    return result;
}
export async function messagingSync(userId: string, sessionId: string, deviceId: string, conversationId: string, after: string, receiptAfter: string = '0') {
    const device = await messagingDevice(userId, sessionId, deviceId);
    const convo = await membership(db, conversationId, userId);
    const member = convo.members.find(m => m.userId === userId)!;
    if (member.hiddenAt)
        return { messages: [], receipts: [], nextCursor: after, nextReceiptCursor: receiptAfter, conversation: messagingConversationDTO(convo, userId) };
    const min = BigInt(after) > member.clearedBefore ? BigInt(after) : member.clearedBefore;
    const rows = await db.e2Message.findMany({ where: { conversationId, serverSequence: { gt: min }, OR: [{ senderDeviceId: device.id }, { envelopes: { some: { recipientDeviceId: device.id } } }], expiresAt: { gt: new Date() } }, include: { senderDevice: true, envelopes: { where: { recipientDeviceId: device.id } }, receipts: { include: { recipientDevice: { select: { userId: true } } } } }, orderBy: { serverSequence: 'asc' }, take: 100 });
    const messages = rows.filter(m => !m.deletedFor.includes(userId)).map(m => ({ id: m.id, eventId: m.clientId, conversation: m.conversationId, fromUserId: m.senderDevice.userId, fromDeviceId: m.senderDeviceId, senderSignalDeviceId: m.senderDevice.signalDeviceId, senderActionSigningPublic: b64(m.senderDevice.actionSigningPublic), senderIdentityPublic: b64(m.senderDevice.identityPublic), toUserId: userId, toDeviceId: deviceId, serverSequence: String(m.serverSequence), createdAt: m.createdAt, seen: m.receipts.map(r => ({ userId: r.recipientDevice.userId, seenAt: r.deliveredAt })), read: m.receipts.filter(r => r.readAt).map(r => ({ userId: r.recipientDevice.userId, readAt: r.readAt })), deletedFor: [], reactions: [], ...(m.envelopes[0] ? { wireType: m.envelopes[0].wireType, ciphertextB64: b64(m.envelopes[0].ciphertext) } : { ownDevice: true }) }));
    const receiptRows = convo.state === 'ACCEPTED' ? await db.e2Outbox.findMany({ where: { conversationId, targetDeviceId: deviceId, sequence: { gt: BigInt(receiptAfter) }, event: 'receipt' }, orderBy: { sequence: 'asc' }, take: 100 }) : [];
    return { messages, receipts: receiptRows.map(row => row.payload), nextReceiptCursor: String(receiptRows.at(-1)?.sequence ?? BigInt(receiptAfter)), nextCursor: String(rows.at(-1)?.serverSequence ?? min), conversation: messagingConversationDTO(convo, userId) };
}
async function storeReceiptBatch(tx: Tx, userId: string, deviceId: string, input: ReceiptBatchInput, epoch: number) {
    const readIds = new Set(input.readIds), ids = [...new Set([...input.deliveredIds, ...input.readIds])];
    if (!ids.length)
        return;
    const messages = await tx.e2Message.findMany({ where: { id: { in: ids }, conversationId: input.conversationId, senderDevice: { userId: { not: userId } }, envelopes: { some: { recipientDeviceId: deviceId } } }, select: { id: true, clientId: true, senderDevice: { select: { userId: true } } } });
    if (messages.length !== ids.length)
        throw new MessagingError(403, 'Receipts must refer to messages for this device');
    const [existing, deliveries, devices] = await Promise.all([
        tx.e2Receipt.findMany({ where: { messageId: { in: ids }, recipientDeviceId: deviceId } }),
        tx.e2Delivery.findMany({ where: { messageId: { in: ids }, userId, hiddenAt: null } }),
        tx.e2Device.findMany({ where: { userId: { in: [userId, ...new Set(messages.map(m => m.senderDevice.userId))] }, revokedAt: null }, select: { id: true, userId: true } }),
    ]);
    const old = new Map(existing.map(r => [r.messageId, r])), now = new Date();
    const fresh = messages.filter(m => !old.has(m.id));
    const upgrades = messages.filter(m => readIds.has(m.id) && old.get(m.id)?.status === 'DELIVERED');
    if (fresh.length)
        await tx.e2Receipt.createMany({ data: fresh.map(m => ({ messageId: m.id, recipientDeviceId: deviceId, status: readIds.has(m.id) ? 'READ' : 'DELIVERED', deliveredAt: now, readAt: readIds.has(m.id) ? now : null })) });
    if (upgrades.length)
        await tx.e2Receipt.updateMany({ where: { messageId: { in: upgrades.map(m => m.id) }, recipientDeviceId: deviceId, status: 'DELIVERED' }, data: { status: 'READ', readAt: now } });
    const unseen = deliveries.filter(d => !d.deliveredAt).length, unread = deliveries.filter(d => !d.readAt && readIds.has(d.messageId)).length;
    if (unseen)
        await tx.e2Delivery.updateMany({ where: { messageId: { in: ids }, userId, hiddenAt: null, deliveredAt: null }, data: { deliveredAt: now } });
    if (unread)
        await tx.e2Delivery.updateMany({ where: { messageId: { in: [...readIds] }, userId, hiddenAt: null, readAt: null }, data: { readAt: now } });
    if (unread || unseen)
        await tx.e2Member.update({ where: { conversationId_userId: { conversationId: input.conversationId, userId } }, data: { unreadCount: { decrement: unread }, unseenCount: { decrement: unseen } } });
    const changes = [...fresh, ...upgrades];
    if (unread || unseen)
        await tx.e2Outbox.createMany({ data: devices.filter(d => d.userId === userId).map(d => ({ dedupeKey: `inbox:${randomUUID()}`, conversationId: input.conversationId, targetDeviceId: d.id, expectedEpoch: epoch, event: 'inbox', payload: { conversationId: input.conversationId } })) });
    if (changes.length)
        await tx.e2Outbox.createMany({ data: changes.flatMap(m => devices.filter(d => d.userId === m.senderDevice.userId).map(d => ({ dedupeKey: `receipt:${m.id}:${deviceId}:${readIds.has(m.id) ? 'READ' : 'DELIVERED'}:${d.id}`, conversationId: input.conversationId, targetDeviceId: d.id, expectedEpoch: epoch, event: 'receipt', payload: { id: m.id, eventId: m.clientId, userId, status: readIds.has(m.id) ? 'READ' : 'DELIVERED', deliveredAt: (old.get(m.id)?.deliveredAt ?? now).toISOString(), readAt: readIds.has(m.id) ? now.toISOString() : null } }))) });
}
export async function messagingReceiptBatch(userId: string, sessionId: string, deviceId: string, input: ReceiptBatchInput) {
    const result = await db.$transaction(async (tx) => {
        await messagingDevice(userId, sessionId, deviceId, tx);
        await conversationLock(tx, input.conversationId);
        const c = await membership(tx, input.conversationId, userId);
        if (c.state !== 'ACCEPTED' || await blocked(tx, c.initiatorId, c.approverId))
            return { suppressed: true };
        await storeReceiptBatch(tx, userId, deviceId, input, c.epoch);
        return { suppressed: false };
    });
    if (!result.suppressed)
        wakeMessagingRelay(input.conversationId);
    return result;
}
export async function messagingReceipt(userId: string, sessionId: string, deviceId: string, input: ReceiptInput) { return messagingReceiptBatch(userId, sessionId, deviceId, { conversationId: input.conversationId, deliveredIds: input.status === 'DELIVERED' ? input.messageIds : [], readIds: input.status === 'READ' ? input.messageIds : [] }); }
export async function resolveMessagingRequest(userId: string, sessionId: string, deviceId: string, conversationId: string, input: {
    action: string;
    deliveredIds: string[];
    readIds: string[];
}) {
    const result = await db.$transaction(async (tx) => {
        await messagingDevice(userId, sessionId, deviceId, tx);
        await conversationLock(tx, conversationId);
        const c = await membership(tx, conversationId, userId);
        if (c.approverId !== userId || c.rejectedAt || c.state === 'BLOCKED')
            throw new MessagingError(403, 'Request unavailable');
        if (input.action === 'accept') {
            if (await blocked(tx, c.initiatorId, c.approverId))
                throw new MessagingError(403, 'Unblock before accepting');
            if (c.state !== 'ACCEPTED')
                await tx.e2Conversation.update({ where: { id: conversationId }, data: { state: 'ACCEPTED', acceptedAt: new Date(), epoch: { increment: 1 } } });
            await storeReceiptBatch(tx, userId, deviceId, { conversationId, deliveredIds: input.deliveredIds, readIds: input.readIds }, c.epoch + (c.state === 'ACCEPTED' ? 0 : 1));
        }
        else {
            if (input.action === 'block')
                await tx.blockUser.upsert({ where: { blockerId_blockedId: { blockerId: userId, blockedId: c.initiatorId } }, create: { blockerId: userId, blockedId: c.initiatorId }, update: {} });
            await tx.e2Conversation.update({ where: { id: conversationId }, data: { rejectedAt: new Date(), state: 'BLOCKED', epoch: { increment: 1 } } });
            await tx.e2Member.update({ where: { conversationId_userId: { conversationId, userId } }, data: { hiddenAt: new Date(), unreadCount: 0, unseenCount: 0 } });
            await tx.e2Envelope.deleteMany({ where: { message: { conversationId }, recipientDevice: { userId } } });
            await tx.e2Delivery.updateMany({ where: { conversationId, userId, hiddenAt: null }, data: { hiddenAt: new Date() } });
            await tx.e2Blob.updateMany({ where: { conversationId }, data: { discardedAt: new Date() } });
        }
        return { ok: true };
    });
    wakeMessagingRelay(conversationId);
    return result;
}
export async function messagingTyping(userId: string, sessionId: string, deviceId: string, conversationId: string) {
    await messagingDevice(userId, sessionId, deviceId);
    const c = await membership(db, conversationId, userId);
    if (c.state !== 'ACCEPTED' || await blocked(db, c.initiatorId, c.approverId))
        return null;
    return c.members.find(m => m.userId !== userId)?.userId;
}
export async function deleteMessagingForMe(userId: string, sessionId: string, deviceId: string, conversationId: string, messageId: string) {
    return db.$transaction(async (tx) => {
        await messagingDevice(userId, sessionId, deviceId, tx);
        await conversationLock(tx, conversationId);
        await membership(tx, conversationId, userId);
        const delivery = await tx.e2Delivery.findUnique({ where: { messageId_userId: { messageId, userId } } });
        await tx.e2Message.updateMany({ where: { id: messageId, conversationId, NOT: { deletedFor: { has: userId } } }, data: { deletedFor: { push: userId } } });
        if (delivery && delivery.conversationId === conversationId && !delivery.hiddenAt) {
            await tx.e2Delivery.update({ where: { messageId_userId: { messageId, userId } }, data: { hiddenAt: new Date() } });
            await tx.e2Member.update({ where: { conversationId_userId: { conversationId, userId } }, data: { unreadCount: { decrement: delivery.readAt ? 0 : 1 }, unseenCount: { decrement: delivery.deliveredAt ? 0 : 1 } } });
        }
        return { ok: true };
    });
}
async function blobPolicy(tx: Tx, userId: string, conversationId: string, write = false) {
    const c = await membership(tx, conversationId, userId);
    if (c.rejectedAt || c.state === 'BLOCKED' || await blocked(tx, c.initiatorId, c.approverId) || (write && c.state === 'PENDING_REQUEST' && c.initiatorId !== userId))
        throw new MessagingError(403, 'Attachment unavailable');
    return c;
}
export async function reserveMessagingBlob(userId: string, sessionId: string, deviceId: string, conversationId: string, input: {
    blobId: string;
    ciphertextBytes: number;
    ciphertextSha256: string;
}) {
    objects.requireMessagingStorage();
    const blob = await db.$transaction(async (tx) => {
        await messagingDevice(userId, sessionId, deviceId, tx);
        await actorLock(tx, userId);
        await conversationLock(tx, conversationId);
        await blobPolicy(tx, userId, conversationId, true);
        const old = await tx.e2Blob.findUnique({ where: { id: input.blobId } });
        if (old) {
            if (old.ownerDeviceId !== deviceId || old.conversationId !== conversationId || old.discardedAt || old.expiresAt <= new Date() || old.ciphertextBytes !== BigInt(input.ciphertextBytes) || old.ciphertextSha256 !== input.ciphertextSha256)
                throw new MessagingError(409, 'Attachment reservation conflict');
            if (old.finalizedAt)
                return old;
            return tx.e2Blob.update({ where: { id: old.id }, data: { uploadGrantExpiresAt: new Date(Math.min(old.expiresAt.getTime(), Date.now() + 300000)) } });
        }
        if (await tx.e2Blob.count({ where: { ownerDeviceId: deviceId, createdAt: { gte: new Date(Date.now() - 86400000) } } }) >= 100)
            throw new MessagingError(429, 'Daily attachment limit reached');
        return tx.e2Blob.create({ data: { id: input.blobId, conversationId, ownerDeviceId: deviceId, objectKey: `e2ee/${randomUUID()}`, ciphertextBytes: input.ciphertextBytes, ciphertextSha256: input.ciphertextSha256, uploadGrantExpiresAt: new Date(Date.now() + 300000), expiresAt: new Date(Date.now() + 15 * 60000) } });
    });
    if (blob.finalizedAt)
        return { blobId: blob.id, finalized: true };
    return { blobId: blob.id, finalized: false, ...await objects.messagingUploadGrant(blob.objectKey, input.ciphertextBytes, Math.max(1, Math.floor(((blob.uploadGrantExpiresAt ?? new Date(Date.now() + 300000)).getTime() - Date.now()) / 1000))) };
}
export async function finalizeMessagingBlob(userId: string, sessionId: string, deviceId: string, conversationId: string, blobId: string) {
    await messagingDevice(userId, sessionId, deviceId);
    await blobPolicy(db, userId, conversationId, true);
    const blob = await db.e2Blob.findFirst({ where: { id: blobId, conversationId, ownerDeviceId: deviceId, discardedAt: null, expiresAt: { gt: new Date() } } });
    if (!blob)
        throw new MessagingError(404, 'Attachment unavailable');
    if (await objects.messagingObjectSize(blob.objectKey) !== Number(blob.ciphertextBytes))
        throw new MessagingError(409, 'Encrypted upload size does not match reservation');
    return db.$transaction(async (tx) => { await messagingDevice(userId, sessionId, deviceId, tx); await conversationLock(tx, conversationId); await blobPolicy(tx, userId, conversationId, true); await tx.e2Blob.updateMany({ where: { id: blobId, discardedAt: null, finalizedAt: null, expiresAt: { gt: new Date() } }, data: { finalizedAt: new Date(), expiresAt: new Date(Date.now() + 90 * 86400000) } }); return { blobId }; });
}
export async function getMessagingBlob(userId: string, sessionId: string, deviceId: string, conversationId: string, blobId: string) {
    await messagingDevice(userId, sessionId, deviceId);
    await blobPolicy(db, userId, conversationId);
    const blob = await db.e2Blob.findFirst({ where: { id: blobId, conversationId, discardedAt: null, finalizedAt: { not: null }, expiresAt: { gt: new Date() } }, select: { objectKey: true, ciphertext: true } });
    if (!blob)
        throw new MessagingError(404, 'Attachment unavailable');
    if (blob.ciphertext)
        return { legacyBytes: Buffer.from(blob.ciphertext) };
    return objects.messagingDownloadGrant(blob.objectKey);
}
export async function revokeMessagingDevice(userId: string, deviceId: string) { await db.e2Device.updateMany({ where: { id: deviceId, userId }, data: { revokedAt: new Date() } }); return { ok: true }; }
function wakeMessagingRelay(conversationId: string) { void dispatchMessagingOutbox(conversationId).catch(err => logger.warn({ event: 'messaging_relay_deferred', conversationId, err }, 'Committed messaging events await recovery')); }
export async function dispatchMessagingOutbox(conversationId?: string) {
    const rows = await db.$transaction(tx => tx.$queryRaw<{
        id: string;
        conversationId: string;
        targetDeviceId: string;
        event: string;
    }[]> `UPDATE "E2Outbox" SET "leaseUntil"=now()+interval '30 seconds',attempts=attempts+1 WHERE id IN (SELECT id FROM "E2Outbox" WHERE "publishedAt" IS NULL AND "availableAt"<=now() AND ("leaseUntil" IS NULL OR "leaseUntil"<now()) AND (${conversationId ?? null}::uuid IS NULL OR "conversationId"=${conversationId ?? null}::uuid) ORDER BY sequence LIMIT 500 FOR UPDATE SKIP LOCKED) RETURNING id,"conversationId","targetDeviceId",event`);
    if (!rows.length)
        return 0;
    try {
        const convos = await db.e2Conversation.findMany({ where: { id: { in: [...new Set(rows.map(r => r.conversationId))] } } });
        const devices = await db.e2Device.findMany({ where: { id: { in: [...new Set(rows.map(r => r.targetDeviceId))] }, revokedAt: null }, select: { id: true } });
        const blocks = await db.blockUser.findMany({ where: { OR: convos.flatMap(c => [{ blockerId: c.initiatorId, blockedId: c.approverId }, { blockerId: c.approverId, blockedId: c.initiatorId }]) }, select: { blockerId: true, blockedId: true } });
        const active = new Set(devices.map(d => d.id)), byId = new Map(convos.map(c => [c.id, c]));
        const hints = rows.filter(r => { const c = byId.get(r.conversationId); return c && active.has(r.targetDeviceId) && (r.event === 'inbox' || (!c.rejectedAt && c.state !== 'BLOCKED' && !(r.event === 'receipt' && c.state !== 'ACCEPTED') && !blocks.some(b => (b.blockerId === c.initiatorId && b.blockedId === c.approverId) || (b.blockerId === c.approverId && b.blockedId === c.initiatorId)))); }).map(r => ({ conversationId: r.conversationId, deviceId: r.targetDeviceId }));
        await publishMessagingHints([...new Map(hints.map(h => [`${h.deviceId}:${h.conversationId}`, h])).values()]);
        await db.e2Outbox.updateMany({ where: { id: { in: rows.map(r => r.id) }, publishedAt: null }, data: { publishedAt: new Date(), leaseUntil: null } });
        return rows.length;
    }
    catch (error) {
        logger.warn({ event: 'messaging_relay_failed', err: error }, 'Messaging hints retained for retry');
        await db.e2Outbox.updateMany({ where: { id: { in: rows.map(r => r.id) }, publishedAt: null }, data: { leaseUntil: null, availableAt: new Date(Date.now() + 5000) } });
        throw error;
    }
}
export async function cleanMessagingRetention() {
    const cutoff = new Date(Date.now() - 90 * 86400000);
    await db.$transaction(async (tx) => {
        const expired = await tx.e2Message.findMany({ where: { expiresAt: { lt: new Date() } }, select: { id: true, conversationId: true }, take: 500 });
        if (expired.length) {
            const ids = expired.map(m => m.id), convoIds = [...new Set(expired.map(m => m.conversationId))].sort();
            await tx.$queryRaw `SELECT id FROM "E2Conversation" WHERE id IN (${Prisma.join(convoIds.map(id => Prisma.sql `${id}::uuid`))}) ORDER BY id FOR UPDATE`;
            await tx.$executeRaw `UPDATE "E2Member" m SET "unreadCount"=GREATEST(0,m."unreadCount"-d.unread),"unseenCount"=GREATEST(0,m."unseenCount"-d.unseen) FROM (SELECT "conversationId","userId",COUNT(*) FILTER (WHERE "readAt" IS NULL)::int unread,COUNT(*) FILTER (WHERE "deliveredAt" IS NULL)::int unseen FROM "E2Delivery" WHERE "hiddenAt" IS NULL AND "messageId" IN (${Prisma.join(ids.map(id => Prisma.sql `${id}::uuid`))}) GROUP BY "conversationId","userId") d WHERE m."conversationId"=d."conversationId" AND m."userId"=d."userId"`;
            await tx.e2Message.deleteMany({ where: { id: { in: ids } } });
        }
        await tx.$executeRaw `DELETE FROM "E2Outbox" WHERE id IN (SELECT id FROM "E2Outbox" WHERE "createdAt"<${cutoff} ORDER BY sequence LIMIT 1000)`;
        await tx.$executeRaw `DELETE FROM "E2PreKeyClaim" WHERE id IN (SELECT id FROM "E2PreKeyClaim" WHERE "createdAt"<${cutoff} LIMIT 1000)`;
        await tx.e2OneTimePreKey.deleteMany({ where: { claimedAt: { lt: cutoff } } });
    });
    const blobs = await db.e2Blob.findMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { discardedAt: { not: null }, OR: [{ uploadGrantExpiresAt: null }, { uploadGrantExpiresAt: { lt: new Date() } }] }] }, take: 100, select: { id: true, objectKey: true, ciphertext: true } });
    for (const blob of blobs) {
        if (!blob.ciphertext)
            await objects.removeMessagingObject(blob.objectKey);
        await db.e2Blob.deleteMany({ where: { id: blob.id } });
    }
}
export async function migrateLegacyMessagingBlobs() {
    objects.requireMessagingStorage();
    const blobs = await db.e2Blob.findMany({ where: { ciphertext: { not: null }, discardedAt: null, expiresAt: { gt: new Date() } }, take: 5 });
    for (const blob of blobs) {
        const key = blob.objectKey.startsWith('e2ee/') ? blob.objectKey : `e2ee/legacy/${blob.id}`;
        await objects.migrateMessagingObject(key, blob.ciphertext!);
        const updated = await db.e2Blob.updateMany({ where: { id: blob.id, ciphertext: { not: null } }, data: { ciphertext: null, objectKey: key } });
        if (updated.count === 0)
            await objects.removeMessagingObject(key);
    }
    return blobs.length;
}
