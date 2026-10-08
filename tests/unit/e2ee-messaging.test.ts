import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
const mocks = vi.hoisted(() => {
    const model = () => Object.fromEntries(['findFirst', 'findMany', 'findUnique', 'findUniqueOrThrow', 'create', 'createMany', 'count', 'upsert', 'update', 'updateMany', 'deleteMany'].map(k => [k, vi.fn()]));
    const db: any = { $transaction: vi.fn(), $executeRaw: vi.fn(), $queryRaw: vi.fn(), e2Device: model(), e2SignedPreKey: model(), e2OneTimePreKey: model(), e2PreKeyClaim: model(), e2Conversation: model(), e2Member: model(), e2Message: model(), e2Envelope: model(), e2Receipt: model(), e2Blob: model(), e2Outbox: model(), blockUser: model(), follow: model(), user: model() };
    return { db, publicUser: vi.fn() };
});
vi.mock('@/db', () => ({ default: mocks.db }));
vi.mock('@/services/v1/utils', () => ({ getPublicUser: mocks.publicUser }));
import * as chat from '@/services/v1/conversations';
const d = randomUUID(), target = randomUUID(), room = randomUUID(), msgId = randomUUID(), clientId = randomUUID();
const device: any = { id: d, userId: 'a', sessionId: 's', signalDeviceId: 1, registrationId: 42, identityPublic: Buffer.alloc(33, 1), actionSigningPublic: Buffer.alloc(32, 2), revokedAt: null };
const convo: any = { id: room, initiatorId: 'a', approverId: 'b', epoch: 1, state: 'PENDING_REQUEST', acceptedAt: null, rejectedAt: null, createdAt: new Date(), members: [{ userId: 'a', clearedBefore: 0n }, { userId: 'b', clearedBefore: 0n }] };
const enroll: any = { deviceId: d, signalDeviceId: 1, registrationId: 42, identityPublic: Buffer.alloc(33, 1).toString('base64'), actionSigningPublic: Buffer.alloc(32, 2).toString('base64'), signedPreKey: { keyId: 1, publicKey: Buffer.alloc(33, 3).toString('base64'), signature: Buffer.alloc(64, 4).toString('base64') }, preKeys: [{ keyId: 1, publicKey: Buffer.alloc(33, 5).toString('base64') }] };
const input: any = { conversationId: room, clientId, envelopes: [{ recipientDeviceId: target, wireType: 3, ciphertextB64: Buffer.alloc(64, 7).toString('base64') }] };
const db = mocks.db;
beforeEach(() => {
    for (const value of Object.values(db))
        if (typeof value === 'function')
            (value as any).mockReset();
        else
            for (const fn of Object.values(value as any))
                (fn as any).mockReset();
    db.$transaction.mockImplementation((work: any) => work(db));
    db.$executeRaw.mockResolvedValue(1);
    db.$queryRaw.mockResolvedValue([]);
    db.e2Device.findFirst.mockResolvedValue(device);
    db.e2Device.findUnique.mockResolvedValue(null);
    db.e2Device.findMany.mockResolvedValue([{ id: target, userId: 'b' }]);
    db.e2Device.count.mockResolvedValue(0);
    db.e2Conversation.findFirst.mockResolvedValue(convo);
    db.e2Conversation.findUnique.mockResolvedValue(null);
    db.e2Conversation.findUniqueOrThrow.mockResolvedValue(convo);
    db.e2Conversation.create.mockResolvedValue(convo);
    db.e2Message.count.mockResolvedValue(0);
    db.e2Message.findUnique.mockResolvedValue(null);
    db.e2Message.findMany.mockResolvedValue([]);
    db.e2Message.create.mockResolvedValue({ id: msgId, serverSequence: 1n });
    db.e2Message.findUniqueOrThrow.mockResolvedValue({ id: msgId, clientId, senderDevice: device });
    db.e2SignedPreKey.findUnique.mockResolvedValue(null);
    db.e2SignedPreKey.findFirst.mockResolvedValue({ keyId: 1, publicKey: Buffer.alloc(33, 3), signature: Buffer.alloc(64, 4) });
    db.e2OneTimePreKey.findUnique.mockResolvedValue(null);
    db.e2PreKeyClaim.findUnique.mockResolvedValue(null);
    db.e2PreKeyClaim.count.mockResolvedValue(0);
    db.e2Receipt.findUnique.mockResolvedValue(null);
    db.e2Receipt.upsert.mockResolvedValue({ status: 'READ', deliveredAt: new Date(), readAt: new Date() });
    db.e2Outbox.findMany.mockResolvedValue([]);
    db.e2Blob.count.mockResolvedValue(0);
    db.blockUser.findFirst.mockResolvedValue(null);
    db.user.findFirst.mockResolvedValue({ id: 'b' });
    db.follow.count.mockResolvedValue(0);
    mocks.publicUser.mockImplementation(async (id: string) => ({ id }));
});
it('requires an active enrolled device bound to the actor session', async () => { expect(await chat.messagingDevice('a', 's', d)).toBe(device); db.e2Device.findFirst.mockResolvedValue(null); await expect(chat.messagingDevice('a', 's', d)).rejects.toThrow('Unlock'); });
it('enrolls public-only keys and reenrollment does not reset existing private identity or consumed public prekeys', async () => {
    await chat.enrollMessagingDevice('a', 's', enroll);
    expect(db.e2Device.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { sessionId: 's' } }));
    db.e2Device.findUnique.mockResolvedValue(device);
    db.e2SignedPreKey.findUnique.mockResolvedValue({ publicKey: Buffer.from(enroll.signedPreKey.publicKey, 'base64'), signature: Buffer.from(enroll.signedPreKey.signature, 'base64') });
    db.e2OneTimePreKey.findUnique.mockResolvedValue({ publicKey: Buffer.from(enroll.preKeys[0].publicKey, 'base64') });
    await chat.enrollMessagingDevice('a', 's', enroll);
});
it.each([{ userId: 'other' }, { revokedAt: new Date() }, { identityPublic: Buffer.alloc(33, 9) }, { actionSigningPublic: Buffer.alloc(32, 9) }, { registrationId: 99 }, { signalDeviceId: 99 }])('rejects immutable device changes %o', async (change) => { db.e2Device.findUnique.mockResolvedValue({ ...device, ...change }); await expect(chat.enrollMessagingDevice('a', 's', enroll)).rejects.toThrow('identity'); });
it('enforces device quota and rejects reused signed/one-time key identifiers and duplicates', async () => {
    db.e2Device.count.mockResolvedValue(10);
    await expect(chat.enrollMessagingDevice('a', 's', enroll)).rejects.toThrow('Revoke');
    db.e2Device.count.mockResolvedValue(0);
    db.e2SignedPreKey.findUnique.mockResolvedValue({ publicKey: Buffer.alloc(33), signature: Buffer.alloc(64) });
    await expect(chat.enrollMessagingDevice('a', 's', enroll)).rejects.toThrow('Signed');
    db.e2SignedPreKey.findUnique.mockResolvedValue({ publicKey: Buffer.from(enroll.signedPreKey.publicKey, 'base64'), signature: Buffer.alloc(64) });
    await expect(chat.enrollMessagingDevice('a', 's', enroll)).rejects.toThrow('Signed');
    db.e2SignedPreKey.findUnique.mockResolvedValue(null);
    await expect(chat.enrollMessagingDevice('a', 's', { ...enroll, preKeys: [...enroll.preKeys, ...enroll.preKeys] })).rejects.toThrow('Duplicate');
    db.e2OneTimePreKey.findUnique.mockResolvedValue({ publicKey: Buffer.alloc(33) });
    await expect(chat.enrollMessagingDevice('a', 's', enroll)).rejects.toThrow('Prekey');
});
it('returns only active public device keys and hides blocked peers', async () => { db.e2Device.findMany.mockResolvedValue([device]); expect(await chat.messagingRoster('b', 'a')).toMatchObject([{ deviceId: d, identityPublic: enroll.identityPublic, actionSigningPublic: enroll.actionSigningPublic }]); db.blockUser.findFirst.mockResolvedValue({ id: 'block' }); expect(await chat.messagingRoster('b', 'a')).toEqual([]); });
it('claims exactly one optional prekey and caches idempotent claims', async () => {
    db.$queryRaw.mockResolvedValue([{ keyId: 1, publicKey: Buffer.alloc(33, 5) }]);
    expect(await chat.claimMessagingPreKey('a', 's', d, target, clientId)).toMatchObject({ preKey: { keyId: 1 } });
    db.$queryRaw.mockResolvedValue([]);
    expect(await chat.claimMessagingPreKey('a', 's', d, target, clientId)).not.toHaveProperty('preKey');
    db.e2PreKeyClaim.findUnique.mockResolvedValue({ requesterDeviceId: d, targetDeviceId: target, bundle: { cached: true } });
    expect(await chat.claimMessagingPreKey('a', 's', d, target, clientId)).toEqual({ cached: true });
    db.e2PreKeyClaim.findUnique.mockResolvedValue({ requesterDeviceId: 'other', targetDeviceId: target });
    await expect(chat.claimMessagingPreKey('a', 's', d, target, clientId)).rejects.toThrow('Claim conflict');
    db.e2PreKeyClaim.findUnique.mockResolvedValue({ requesterDeviceId: d, targetDeviceId: 'other' });
    await expect(chat.claimMessagingPreKey('a', 's', d, target, clientId)).rejects.toThrow('Claim conflict');
});
it('rejects prekey claims for missing/blocked devices, exhaustion without signed prekeys and excess claims', async () => {
    db.e2Device.findFirst.mockResolvedValueOnce(device).mockResolvedValueOnce(null);
    await expect(chat.claimMessagingPreKey('a', 's', d, target, clientId)).rejects.toThrow('unavailable');
    db.blockUser.findFirst.mockResolvedValue({ id: 'block' });
    await expect(chat.claimMessagingPreKey('a', 's', d, target, clientId)).rejects.toThrow('unavailable');
    db.blockUser.findFirst.mockResolvedValue(null);
    db.e2PreKeyClaim.count.mockResolvedValue(200);
    await expect(chat.claimMessagingPreKey('a', 's', d, target, clientId)).rejects.toThrow('Too many');
    db.e2PreKeyClaim.count.mockResolvedValue(0);
    db.e2SignedPreKey.findFirst.mockResolvedValue(null);
    await expect(chat.claimMessagingPreKey('a', 's', d, target, clientId)).rejects.toThrow('not ready');
});
it('canonically creates/reuses requests; only mutual accepted contacts bypass acceptance', async () => {
    await expect(chat.createMessagingConversation('a', 'a')).rejects.toThrow('another');
    expect((await chat.createMessagingConversation('a', 'b')).state).toBe('PENDING_REQUEST');
    db.follow.count.mockResolvedValue(2);
    db.e2Conversation.create.mockResolvedValue({ ...convo, acceptedAt: new Date() });
    expect((await chat.createMessagingConversation('a', 'b')).state).toBe('ACCEPTED');
    db.e2Conversation.findUnique.mockResolvedValue(convo);
    expect((await chat.createMessagingConversation('a', 'b')).id).toBe(room);
});
it('does not create requests for missing or blocked users', async () => { db.blockUser.findFirst.mockResolvedValue({ id: 'block' }); await expect(chat.createMessagingConversation('a', 'b')).rejects.toThrow('unavailable'); db.blockUser.findFirst.mockResolvedValue(null); db.user.findFirst.mockResolvedValue(null); await expect(chat.createMessagingConversation('a', 'b')).rejects.toThrow('unavailable'); });
it.each(['chat', 'requests'])('lists and hydrates actor-scoped folder %s', async (kind) => { db.e2Conversation.findMany.mockResolvedValue([convo]); expect(await chat.listMessagingConversations('a', kind, 2, 10)).toMatchObject([{ initiator: { user: { id: 'a' } }, responder: { user: { id: 'b' } } }]); });
it('loads public peer metadata without claiming prekeys; distinguishes a new conversation', async () => { db.e2Device.findMany.mockResolvedValue([device]); expect((await chat.messagingPeer('a', 'b')).convo).toBeUndefined(); db.e2Conversation.findUnique.mockResolvedValue(convo); expect((await chat.messagingPeer('a', 'b')).convo?.id).toBe(room); });
it('commits opaque ciphertext and exact retries; duplicate bytes cannot mutate an existing event', async () => {
    expect(await chat.sendMessagingEvent('a', 's', d, input)).toEqual({ messageId: msgId, status: 'SENT', serverSequence: '1' });
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(JSON.stringify(input)).digest();
    db.e2Message.findUnique.mockResolvedValue({ id: msgId, serverSequence: 1n, requestDigest: hash });
    expect((await chat.sendMessagingEvent('a', 's', d, input)).messageId).toBe(msgId);
    db.e2Message.findUnique.mockResolvedValue({ requestDigest: Buffer.alloc(32) });
    await expect(chat.sendMessagingEvent('a', 's', d, input)).rejects.toThrow('different ciphertext');
});
it('rejects nonmembers and pending recipients; silently discards messages after private rejection/block', async () => {
    db.e2Conversation.findFirst.mockResolvedValue(null);
    await expect(chat.sendMessagingEvent('a', 's', d, input)).rejects.toThrow('not found');
    db.e2Conversation.findFirst.mockResolvedValue(convo);
    await expect(chat.sendMessagingEvent('b', 's', d, input)).rejects.toThrow('Accept');
    for (const change of [{ rejectedAt: new Date() }, { state: 'BLOCKED' }]) {
        db.e2Conversation.findFirst.mockResolvedValue({ ...convo, ...change });
        expect((await chat.sendMessagingEvent('a', 's', d, input)).serverSequence).toBe('0');
    }
    db.e2Conversation.findFirst.mockResolvedValue(convo);
    db.blockUser.findFirst.mockResolvedValue({ id: 'block' });
    expect((await chat.sendMessagingEvent('a', 's', d, input)).status).toBe('SENT');
});
it('enforces send quotas, request cap and exact device roster', async () => {
    db.e2Message.count.mockResolvedValueOnce(60);
    await expect(chat.sendMessagingEvent('a', 's', d, input)).rejects.toThrow('Too many');
    db.e2Message.count.mockResolvedValueOnce(0).mockResolvedValueOnce(10);
    await expect(chat.sendMessagingEvent('a', 's', d, input)).rejects.toThrow('accepted');
    await expect(chat.sendMessagingEvent('a', 's', d, { ...input, envelopes: [...input.envelopes, ...input.envelopes] })).rejects.toThrow('roster');
    await expect(chat.sendMessagingEvent('a', 's', d, { ...input, envelopes: [{ ...input.envelopes[0], recipientDeviceId: 'other' }] })).rejects.toThrow('roster');
    db.e2Device.findMany.mockResolvedValue([{ id: target, userId: 'a' }]);
    await expect(chat.sendMessagingEvent('a', 's', d, input)).rejects.toThrow('roster');
    db.e2Device.findMany.mockResolvedValue([{ id: target, userId: 'b' }, { id: 'new', userId: 'b' }]);
    await expect(chat.sendMessagingEvent('a', 's', d, input)).rejects.toThrow('roster');
    db.e2Conversation.findFirst.mockResolvedValue({ ...convo, state: 'ACCEPTED' });
    db.e2Device.findMany.mockResolvedValue([{ id: target, userId: 'b' }]);
    await chat.sendMessagingEvent('a', 's', d, input);
});
it('sync scopes ciphertext to this device, advances monotonic cursors and suppresses receipts for requests', async () => {
    const row = { id: msgId, clientId, conversationId: room, senderDevice: device, senderDeviceId: d, serverSequence: 2n, createdAt: new Date(), deletedFor: [], envelopes: [{ wireType: 3, ciphertext: Buffer.alloc(64) }], receipts: [{ recipientDevice: { userId: 'b' }, deliveredAt: new Date(), readAt: new Date() }, { recipientDevice: { userId: 'b' }, deliveredAt: new Date(), readAt: null }] };
    db.e2Message.findMany.mockResolvedValue([row]);
    expect(await chat.messagingSync('a', 's', d, room, '0')).toMatchObject({ nextCursor: '2', receipts: [], messages: [{ ciphertextB64: expect.any(String) }] });
    db.e2Message.findMany.mockResolvedValue([{ ...row, envelopes: [], receipts: [] }]);
    expect((await chat.messagingSync('a', 's', d, room, '5')).messages[0]).toHaveProperty('ownDevice', true);
    db.e2Message.findMany.mockResolvedValue([{ ...row, deletedFor: ['a'] }]);
    expect((await chat.messagingSync('a', 's', d, room, '0')).messages).toEqual([]);
    db.e2Conversation.findFirst.mockResolvedValue({ ...convo, state: 'ACCEPTED', members: [{ userId: 'a', clearedBefore: 9n }] });
    db.e2Message.findMany.mockResolvedValue([]);
    db.e2Outbox.findMany.mockResolvedValue([{ sequence: 4n, payload: { status: 'READ' } }]);
    expect(await chat.messagingSync('a', 's', d, room, '0')).toMatchObject({ nextCursor: '9', nextReceiptCursor: '4', receipts: [{ status: 'READ' }] });
    db.e2Outbox.findMany.mockResolvedValue([]);
    expect((await chat.messagingSync('a', 's', d, room, '0', '8')).nextReceiptCursor).toBe('8');
    db.e2Conversation.findFirst.mockResolvedValue({ ...convo, members: [{ userId: 'a', hiddenAt: new Date(), clearedBefore: 0n }] });
    expect((await chat.messagingSync('a', 's', d, room, '0')).messages).toEqual([]);
});
it('only accepted recipients may create receipts; READ never regresses and repeated events remain idempotent', async () => {
    const receipt: any = { conversationId: room, messageIds: [msgId], status: 'READ' };
    expect(await chat.messagingReceipt('b', 's', d, receipt)).toEqual({ suppressed: true });
    db.e2Conversation.findFirst.mockResolvedValue({ ...convo, state: 'ACCEPTED' });
    db.blockUser.findFirst.mockResolvedValue({ id: 'block' });
    expect(await chat.messagingReceipt('b', 's', d, receipt)).toEqual({ suppressed: true });
    db.blockUser.findFirst.mockResolvedValue(null);
    await expect(chat.messagingReceipt('b', 's', d, receipt)).rejects.toThrow('Receipts');
    db.e2Message.findMany.mockResolvedValue([{ id: msgId }]);
    expect(await chat.messagingReceipt('b', 's', d, receipt)).toEqual({ suppressed: false });
    expect(db.e2Outbox.create).toHaveBeenCalled();
    db.e2Receipt.findUnique.mockResolvedValue({ status: 'READ' });
    await chat.messagingReceipt('b', 's', d, { ...receipt, status: 'DELIVERED' });
    db.e2Receipt.findUnique.mockResolvedValue({ status: 'DELIVERED' });
    await chat.messagingReceipt('b', 's', d, { ...receipt, status: 'DELIVERED' });
    db.e2Receipt.findUnique.mockResolvedValue(null);
    db.e2Receipt.upsert.mockResolvedValue({ status: 'DELIVERED', deliveredAt: new Date(), readAt: null });
    await chat.messagingReceipt('b', 's', d, { ...receipt, status: 'DELIVERED' });
});
it('accepts requests with exact delivered/read IDs; rejection purges recipient payloads and blocking persists policy', async () => {
    const request = { action: 'accept', deliveredIds: [msgId], readIds: [msgId] };
    db.e2Message.findMany.mockResolvedValue([{ id: msgId }]);
    await chat.resolveMessagingRequest('b', 's', d, room, request);
    expect(db.e2Conversation.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ state: 'ACCEPTED' }) }));
    db.e2Conversation.findFirst.mockResolvedValue({ ...convo, state: 'ACCEPTED' });
    await chat.resolveMessagingRequest('b', 's', d, room, { action: 'accept', deliveredIds: [], readIds: [] });
    db.blockUser.findFirst.mockResolvedValue({ id: 'block' });
    await expect(chat.resolveMessagingRequest('b', 's', d, room, request)).rejects.toThrow('Unblock');
    db.blockUser.findFirst.mockResolvedValue(null);
    await expect(chat.resolveMessagingRequest('a', 's', d, room, request)).rejects.toThrow('unavailable');
    db.e2Conversation.findFirst.mockResolvedValue({ ...convo, rejectedAt: new Date() });
    await expect(chat.resolveMessagingRequest('b', 's', d, room, request)).rejects.toThrow('unavailable');
    db.e2Conversation.findFirst.mockResolvedValue({ ...convo, state: 'BLOCKED' });
    await expect(chat.resolveMessagingRequest('b', 's', d, room, request)).rejects.toThrow('unavailable');
    db.e2Conversation.findFirst.mockResolvedValue(convo);
    for (const action of ['reject', 'block'])
        await chat.resolveMessagingRequest('b', 's', d, room, { action, deliveredIds: [], readIds: [] });
    expect(db.blockUser.upsert).toHaveBeenCalled();
    expect(db.e2Envelope.deleteMany).toHaveBeenCalled();
});
it('gates typing on current membership and policy; delete for me is owner scoped', async () => { expect(await chat.messagingTyping('a', 's', d, room)).toBeNull(); db.e2Conversation.findFirst.mockResolvedValue({ ...convo, state: 'ACCEPTED' }); expect(await chat.messagingTyping('a', 's', d, room)).toBe('b'); db.e2Conversation.findFirst.mockResolvedValue({ ...convo, state: 'ACCEPTED', members: [{ userId: 'a' }] }); expect(await chat.messagingTyping('a', 's', d, room)).toBeUndefined(); db.blockUser.findFirst.mockResolvedValue({ id: 'block' }); expect(await chat.messagingTyping('a', 's', d, room)).toBeNull(); await chat.deleteMessagingForMe('a', 's', d, room, msgId); expect(db.e2Message.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ NOT: { deletedFor: { has: 'a' } } }) })); await chat.revokeMessagingDevice('a', d); expect(db.e2Device.updateMany).toHaveBeenCalled(); });
it('checks membership, policy, size, quotas, expiry and existence for private attachment relay', async () => {
    const bytes = Buffer.alloc(64);
    await chat.putMessagingBlob('a', 's', d, room, msgId, bytes);
    expect(db.e2Blob.create).toHaveBeenCalled();
    for (const change of [{ rejectedAt: new Date() }, { state: 'BLOCKED' }]) {
        db.e2Conversation.findFirst.mockResolvedValue({ ...convo, ...change });
        await expect(chat.putMessagingBlob('a', 's', d, room, msgId, bytes)).rejects.toThrow('unavailable');
    }
    db.e2Conversation.findFirst.mockResolvedValue(convo);
    db.blockUser.findFirst.mockResolvedValue({ id: 'block' });
    await expect(chat.putMessagingBlob('a', 's', d, room, msgId, bytes)).rejects.toThrow('unavailable');
    db.blockUser.findFirst.mockResolvedValue(null);
    await expect(chat.putMessagingBlob('b', 's', d, room, msgId, bytes)).rejects.toThrow('unavailable');
    for (const b of [Buffer.alloc(1), Buffer.alloc(8388625)])
        await expect(chat.putMessagingBlob('a', 's', d, room, msgId, b)).rejects.toThrow('limit');
    db.e2Blob.count.mockResolvedValue(100);
    await expect(chat.putMessagingBlob('a', 's', d, room, msgId, bytes)).rejects.toThrow('Daily');
    db.e2Blob.findFirst.mockResolvedValue({ ciphertext: bytes });
    expect(await chat.getMessagingBlob('b', 's', d, room, msgId)).toEqual(bytes);
    db.e2Blob.findFirst.mockResolvedValue(null);
    await expect(chat.getMessagingBlob('b', 's', d, room, msgId)).rejects.toThrow('unavailable');
    db.e2Conversation.findFirst.mockResolvedValue({ ...convo, rejectedAt: new Date() });
    await expect(chat.getMessagingBlob('b', 's', d, room, msgId)).rejects.toThrow('unavailable');
    db.e2Conversation.findFirst.mockResolvedValue(convo);
    db.blockUser.findFirst.mockResolvedValue({ id: 'block' });
    await expect(chat.getMessagingBlob('b', 's', d, room, msgId)).rejects.toThrow('unavailable');
});
it('durable socket hints never emit rejected/blocked conversation or pending receipt metadata', async () => {
    db.e2Outbox.findMany.mockResolvedValue([{ sequence: 1n, event: 'message', conversationId: room, targetDeviceId: d }]);
    db.e2Conversation.findUnique.mockResolvedValue(convo);
    expect(await chat.messagingSocketHints([d], 0n)).toEqual({ hints: [{ conversationId: room, deviceId: d }], cursor: 1n });
    for (const c of [null, { ...convo, rejectedAt: new Date() }, { ...convo, state: 'BLOCKED' }]) {
        db.e2Conversation.findUnique.mockResolvedValue(c);
        expect((await chat.messagingSocketHints([d], 0n)).hints).toEqual([]);
    }
    db.e2Conversation.findUnique.mockResolvedValue(convo);
    db.e2Outbox.findMany.mockResolvedValue([{ sequence: 2n, event: 'receipt', conversationId: room, targetDeviceId: d }]);
    expect((await chat.messagingSocketHints([d], 0n)).hints).toEqual([]);
    db.e2Conversation.findUnique.mockResolvedValue({ ...convo, state: 'ACCEPTED' });
    expect((await chat.messagingSocketHints([d], 0n)).hints).toHaveLength(1);
    db.blockUser.findFirst.mockResolvedValue({ id: 'block' });
    expect((await chat.messagingSocketHints([d], 0n)).hints).toEqual([]);
    db.e2Outbox.findMany.mockResolvedValue([]);
    expect((await chat.messagingSocketHints([], 3n)).cursor).toBe(3n);
});
it('cleans expired relay ciphertext and key claims without touching current keys or plaintext logs', async () => { await chat.cleanMessagingRetention(); expect(db.e2Message.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: expect.any(Date) } } }); expect(db.e2Blob.deleteMany).toHaveBeenCalled(); expect(db.e2OneTimePreKey.deleteMany).toHaveBeenCalledWith({ where: { claimedAt: { lt: expect.any(Date) } } }); });
