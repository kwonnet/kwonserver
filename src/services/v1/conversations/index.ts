import {getPublicUser} from "../utils";
import db from '@/db';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { EnrollInput, SendInput, ReceiptInput } from './e2ee-contracts';
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
    const keys = input.preKeys.map(key => ({keyId:key.keyId, publicKey:Buffer.from(key.publicKey,'base64')}));
    if(new Set(keys.map(key=>key.keyId)).size!==keys.length)
        throw new MessagingError(400,'Duplicate prekey IDs');
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
        if(keys.length){
            // One read and one insert for the entire bundle, rather than 2N round trips.
            const stored = await tx.e2OneTimePreKey.findMany({
                where:{deviceId:input.deviceId,keyId:{in:keys.map(key=>key.keyId)}},
                select:{keyId:true,publicKey:true},
            });
            const existingKeys = new Map(stored.map(key=>[key.keyId,key.publicKey]));
            for(const key of keys){
                const old=existingKeys.get(key.keyId);
                if(old && !Buffer.from(old).equals(key.publicKey))
                    throw new MessagingError(409,'Prekey ID cannot be reused');
            }
            const fresh=keys.filter(key=>!existingKeys.has(key.keyId));
            if(fresh.length)await tx.e2OneTimePreKey.createMany({data:fresh.map(key=>({deviceId:input.deviceId,...key}))});
        }
        return { deviceId: input.deviceId };
    }, {maxWait:5000, timeout:15000});
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
    return { id: c.id, kind: 'chat', state: accepted ? 'ACCEPTED' : 'PENDING_REQUEST', epoch: c.epoch, initiator: { id: c.initiatorId, acceptedAt: c.createdAt, isPaid: false }, responder: { id: c.approverId, acceptedAt: c.acceptedAt, isPaid: false }, unreadCount: 0, unseenCount: 0, createdAt: c.createdAt, updatedAt: c.createdAt };
}
export async function listMessagingConversations(userId: string, kind: string, page: number, limit: number) {
    const rows = await db.e2Conversation.findMany({ where: { members: { some: { userId, hiddenAt: null } }, ...(kind === 'requests' ? { approverId: userId, acceptedAt: null, rejectedAt: null } : { OR: [{ acceptedAt: { not: null } }, { initiatorId: userId }] }) }, include: { members: true, messages: { take: 1, orderBy: { serverSequence: 'desc' } } }, orderBy: { createdAt: 'desc' }, take: Math.min(limit, 100), skip: Math.max(0, page - 1) * limit });
    return Promise.all(rows.map(async (c) => {
        const dto = messagingConversationDTO(c, userId);
        const [a, b] = await Promise.all([getPublicUser(c.initiatorId), getPublicUser(c.approverId)]);
        const where = { conversationId: c.id, senderDevice: { userId: { not: userId } }, envelopes: { some: { recipientDevice: { userId } } }, NOT: { deletedFor: { has: userId } }, expiresAt: { gt: new Date() } };
        const [unreadCount, unseenCount] = await Promise.all([db.e2Message.count({ where: { ...where, receipts: { none: { recipientDevice: { userId }, status: 'READ' } } } }), db.e2Message.count({ where: { ...where, receipts: { none: { recipientDevice: { userId } } } } })]);
        return { ...dto, unreadCount, unseenCount, initiator: { ...dto.initiator, user: a }, responder: { ...dto.responder, user: b }, lastMessage: undefined };
    }));
}
export async function messagingPeer(userId: string, recipientId: string) {
    const pairKey = digest(['kwonnet-direct-v2', ...[userId, recipientId].sort()]).toString('hex');
    const c = await db.e2Conversation.findUnique({ where: { pairKey }, include: { members: true } });
    return { recipient: await getPublicUser(recipientId), recipientDevices: await messagingRoster(userId, recipientId), convo: c ? messagingConversationDTO(c, userId) : undefined, messages: [] };
}
export async function sendMessagingEvent(userId: string, sessionId: string, deviceId: string, input: SendInput) {
    return db.$transaction(async (tx) => {
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
        const msg = await tx.e2Message.create({ data: { conversationId: convo.id, senderDeviceId: deviceId, clientId: input.clientId, requestDigest: hash, expiresAt: new Date(Date.now() + 90 * 86400000), envelopes: { create: input.envelopes.map(e => ({ recipientDeviceId: e.recipientDeviceId, wireType: e.wireType, ciphertext: Buffer.from(e.ciphertextB64, 'base64') })) } } });
        for (const envelope of input.envelopes)
            await tx.e2Outbox.create({ data: { dedupeKey: `message:${msg.id}:${envelope.recipientDeviceId}`, conversationId: convo.id, targetDeviceId: envelope.recipientDeviceId, expectedEpoch: convo.epoch, event: 'message', payload: { conversationId: convo.id } } });
        return { messageId: msg.id, status: 'SENT', serverSequence: String(msg.serverSequence) };
    });
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
async function storeReceipts(tx: Tx, userId: string, deviceId: string, input: ReceiptInput) {
    const messages = await tx.e2Message.findMany({ where: { id: { in: input.messageIds }, conversationId: input.conversationId, senderDevice: { userId: { not: userId } }, envelopes: { some: { recipientDeviceId: deviceId } } }, select: { id: true } });
    if (messages.length !== new Set(input.messageIds).size)
        throw new MessagingError(403, 'Receipts must refer to messages for this device');
    for (const m of messages) {
        const old = await tx.e2Receipt.findUnique({ where: { messageId_recipientDeviceId: { messageId: m.id, recipientDeviceId: deviceId } } });
        if (old && (old.status === 'READ' || input.status === 'DELIVERED'))
            continue;
        const receipt = await tx.e2Receipt.upsert({ where: { messageId_recipientDeviceId: { messageId: m.id, recipientDeviceId: deviceId } }, create: { messageId: m.id, recipientDeviceId: deviceId, status: input.status, deliveredAt: new Date(), readAt: input.status === 'READ' ? new Date() : null }, update: input.status === 'READ' ? { status: 'READ', readAt: new Date() } : {} });
        const message = await tx.e2Message.findUniqueOrThrow({ where: { id: m.id }, include: { senderDevice: true } });
        const devices = await tx.e2Device.findMany({ where: { userId: message.senderDevice.userId, revokedAt: null }, select: { id: true } });
        const convo = await tx.e2Conversation.findUniqueOrThrow({ where: { id: input.conversationId } });
        for (const device of devices)
            await tx.e2Outbox.create({ data: { dedupeKey: `receipt:${m.id}:${deviceId}:${input.status}:${device.id}`, conversationId: input.conversationId, targetDeviceId: device.id, expectedEpoch: convo.epoch, event: 'receipt', payload: { id: m.id, eventId: message.clientId, userId, status: receipt.status, deliveredAt: receipt.deliveredAt.toISOString(), readAt: receipt.readAt?.toISOString() ?? null } } });
    }
}
export async function messagingReceipt(userId: string, sessionId: string, deviceId: string, input: ReceiptInput) {
    return db.$transaction(async (tx) => {
        await messagingDevice(userId, sessionId, deviceId, tx);
        await conversationLock(tx, input.conversationId);
        const c = await membership(tx, input.conversationId, userId);
        if (c.state !== 'ACCEPTED' || await blocked(tx, c.initiatorId, c.approverId))
            return { suppressed: true };
        await storeReceipts(tx, userId, deviceId, input);
        return { suppressed: false };
    });
}
export async function resolveMessagingRequest(userId: string, sessionId: string, deviceId: string, conversationId: string, input: {
    action: string;
    deliveredIds: string[];
    readIds: string[];
}) {
    return db.$transaction(async (tx) => {
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
            if (input.deliveredIds.length)
                await storeReceipts(tx, userId, deviceId, { conversationId, messageIds: input.deliveredIds, status: 'DELIVERED' });
            if (input.readIds.length)
                await storeReceipts(tx, userId, deviceId, { conversationId, messageIds: input.readIds, status: 'READ' });
        }
        else {
            if (input.action === 'block')
                await tx.blockUser.upsert({ where: { blockerId_blockedId: { blockerId: userId, blockedId: c.initiatorId } }, create: { blockerId: userId, blockedId: c.initiatorId }, update: {} });
            await tx.e2Conversation.update({ where: { id: conversationId }, data: { rejectedAt: new Date(), state: 'BLOCKED', epoch: { increment: 1 } } });
            await tx.e2Member.update({ where: { conversationId_userId: { conversationId, userId } }, data: { hiddenAt: new Date() } });
            await tx.e2Envelope.deleteMany({ where: { message: { conversationId }, recipientDevice: { userId } } });
            await tx.e2Blob.deleteMany({ where: { conversationId } });
        }
        return { ok: true };
    });
}
export async function messagingTyping(userId: string, sessionId: string, deviceId: string, conversationId: string) {
    await messagingDevice(userId, sessionId, deviceId);
    const c = await membership(db, conversationId, userId);
    if (c.state !== 'ACCEPTED' || await blocked(db, c.initiatorId, c.approverId))
        return null;
    return c.members.find(m => m.userId !== userId)?.userId;
}
export async function deleteMessagingForMe(userId: string, sessionId: string, deviceId: string, conversationId: string, messageId: string) {
    await messagingDevice(userId, sessionId, deviceId);
    await membership(db, conversationId, userId);
    await db.e2Message.updateMany({ where: { id: messageId, conversationId, NOT: { deletedFor: { has: userId } } }, data: { deletedFor: { push: userId } } });
    return { ok: true };
}
export async function putMessagingBlob(userId: string, sessionId: string, deviceId: string, conversationId: string, blobId: string, ciphertext: Buffer) {
    return db.$transaction(async (tx) => {
        await messagingDevice(userId, sessionId, deviceId, tx);
        await actorLock(tx, userId);
        await conversationLock(tx, conversationId);
        const c = await membership(tx, conversationId, userId);
        if (c.rejectedAt || c.state === 'BLOCKED' || await blocked(tx, c.initiatorId, c.approverId) || (c.state === 'PENDING_REQUEST' && c.initiatorId !== userId))
            throw new MessagingError(403, 'Attachment unavailable');
        if (ciphertext.length < 16 || ciphertext.length > 8 * 1024 * 1024 + 16)
            throw new MessagingError(413, 'Attachment limit is 8 MB');
        const count = await tx.e2Blob.count({ where: { ownerDeviceId: deviceId, finalizedAt: { gte: new Date(Date.now() - 86400000) } } });
        if (count >= 100)
            throw new MessagingError(429, 'Daily attachment limit reached');
        await tx.e2Blob.create({ data: { id: blobId, conversationId, ownerDeviceId: deviceId, objectKey: randomUUID(), ciphertext: new Uint8Array(ciphertext), ciphertextBytes: ciphertext.length, finalizedAt: new Date(), expiresAt: new Date(Date.now() + 90 * 86400000) } });
        return { blobId };
    });
}
export async function getMessagingBlob(userId: string, sessionId: string, deviceId: string, conversationId: string, blobId: string) {
    await messagingDevice(userId, sessionId, deviceId);
    const c = await membership(db, conversationId, userId);
    if (c.rejectedAt || await blocked(db, c.initiatorId, c.approverId))
        throw new MessagingError(404, 'Attachment unavailable');
    const blob = await db.e2Blob.findFirst({ where: { id: blobId, conversationId, expiresAt: { gt: new Date() } }, select: { ciphertext: true } });
    if (!blob?.ciphertext)
        throw new MessagingError(404, 'Attachment unavailable');
    return Buffer.from(blob.ciphertext);
}
export async function revokeMessagingDevice(userId: string, deviceId: string) { await db.e2Device.updateMany({ where: { id: deviceId, userId }, data: { revokedAt: new Date() } }); return { ok: true }; }
export async function messagingSocketHints(deviceIds: string[], after: bigint) {
    const rows = await db.e2Outbox.findMany({ where: { targetDeviceId: { in: deviceIds }, sequence: { gt: after } }, orderBy: { sequence: 'asc' }, take: 100 });
    const hints = [];
    for (const row of rows) {
        const convo = await db.e2Conversation.findUnique({ where: { id: row.conversationId } });
        if (!convo || convo.rejectedAt || convo.state === 'BLOCKED' || (row.event === 'receipt' && convo.state !== 'ACCEPTED') || await blocked(db, convo.initiatorId, convo.approverId))
            continue;
        hints.push({ conversationId: row.conversationId, deviceId: row.targetDeviceId });
    }
    return { hints, cursor: rows.at(-1)?.sequence ?? after };
}
export async function cleanMessagingRetention() {
    const cutoff = new Date(Date.now() - 90 * 86400000);
    await db.$transaction(async (tx) => {
        await tx.e2Blob.deleteMany({ where: { expiresAt: { lt: new Date() } } });
        await tx.e2Outbox.deleteMany({ where: { createdAt: { lt: cutoff } } });
        await tx.e2Message.deleteMany({ where: { expiresAt: { lt: new Date() } } });
        await tx.e2PreKeyClaim.deleteMany({ where: { createdAt: { lt: cutoff } } });
        await tx.e2OneTimePreKey.deleteMany({ where: { claimedAt: { lt: cutoff } } });
    });
}
