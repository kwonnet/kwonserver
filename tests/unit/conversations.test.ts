import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { resetMocks } from './fixtures';
const deps = vi.hoisted(() => ({
  ConversationModel: { findOne: vi.fn(), create: vi.fn(), aggregate: vi.fn() },
  DeviceModel: { find: vi.fn(), updateOne: vi.fn() },
  MessageModel: { find: vi.fn(), updateMany: vi.fn() }, publicUser: vi.fn(), sort: vi.fn(), limit: vi.fn(),
}));
vi.mock('@/db/models', () => deps);
vi.mock('@/services/v1/utils', () => ({ getPublicUser: deps.publicUser }));
import * as chat from '@/services/v1/conversations';
import * as anonymous from '@/services/v1/anonymous';
import { ConvoKind } from '@/types';
const now = new Date('2026-10-01T12:00:00Z');
const convo = { _id: 'c', initiator: { id: 'u' }, responder: { id: 'r' } };
const message = (id: string, fromUserId = 'u'): any => ({ _id: id, fromUserId, toJSON: () => ({ id, fromUserId, ciphertext: 'encrypted' }) });
const device = { _id: 'd', deviceId: 'phone', userId: 'r', identityPubEd25519: 'ed', identityPubX25519: 'x', signedPreKeyPubX25519: 'signed', signedPreKeySignature: 'sig',
  oneTimePreKeys: [{ keyId: 1, pubX25519: 'used', consumedAt: now }, { keyId: 2, pubX25519: 'fresh' }] };
beforeEach(() => {
  resetMocks(deps); vi.useFakeTimers(); vi.setSystemTime(now); vi.spyOn(console, 'log').mockImplementation(() => {});
  deps.publicUser.mockImplementation(async id => ({ id, name: id }));
  deps.ConversationModel.findOne.mockResolvedValue(convo); deps.ConversationModel.aggregate.mockResolvedValue([]);
  deps.DeviceModel.find.mockResolvedValue([]); deps.DeviceModel.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  deps.MessageModel.find.mockReturnValue({ sort: deps.sort }); deps.sort.mockReturnValue({ limit: deps.limit }); deps.limit.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());
for (const [name, service] of [['chat', chat], ['anonymous', anonymous]] as const) describe(name, () => {
  const body = { senderId: 'u', recipientId: 'r', kind: ConvoKind.CHAT };
  it('finds an existing conversation in either direction by participant ID', async () => {
    deps.ConversationModel.findOne.mockResolvedValue({ toJSON: () => ({ id: 'c' }) });
    expect(await service.createConversation(body)).toEqual({ status: 200, data: { id: 'c' } });
    expect(deps.ConversationModel.findOne).toHaveBeenCalledWith({ $or: [
      { 'initiator.id': 'u', 'responder.id': 'r', kind: ConvoKind.CHAT },
      { 'initiator.id': 'r', 'responder.id': 'u', kind: ConvoKind.CHAT },
    ] }); expect(deps.ConversationModel.create).not.toHaveBeenCalled();
  });
  it.each(['r', 'u'])('creates a conversation with recipient %s and appropriate acceptance', async recipientId => {
    deps.ConversationModel.findOne.mockResolvedValue(null); deps.ConversationModel.create.mockResolvedValue({ toJSON: () => ({ id: 'new' }) });
    expect((await service.createConversation({ ...body, recipientId })).status).toBe(201);
    expect(deps.ConversationModel.create).toHaveBeenCalledWith({ initiator: { id: 'u', acceptedAt: now }, responder: { id: recipientId, ...(recipientId === 'u' ? { acceptedAt: now } : {}) }, kind: ConvoKind.CHAT });
  });
  it('reports a conversation lookup failure without creating a duplicate', async () => {
    deps.ConversationModel.findOne.mockRejectedValue(new Error('private db detail'));
    expect(await service.createConversation(body)).toEqual({ status: 500, data: 'Error initiating conversation ' }); expect(deps.ConversationModel.create).not.toHaveBeenCalled();
  });
  it.each([[], [{ keyId: 4, pubX25519: 'new' }], undefined].map(keys => ({ keys })))('registers device keys with an owner-scoped upsert', async ({ keys }) => {
    const arg: any = { userId: 'u', deviceId: 'phone', identityPubEd25519: 'ed', identityPubX25519: 'x', signedPreKeyPubX25519: 'signed', signedPreKeySignature: 'sig', oneTimePreKeys: keys };
    expect((await service.registerUserChatDevice(arg)).status).toBe(201);
    expect(deps.DeviceModel.updateOne).toHaveBeenCalledWith({ userId: 'u', deviceId: 'phone' }, {
      $set: { identityPubEd25519: 'ed', identityPubX25519: 'x', signedPreKeyPubX25519: 'signed', signedPreKeySignature: 'sig' },
      $push: { oneTimePreKeys: { $each: keys || [] } },
    }, { upsert: true });
  });
  it.each([[], undefined, [{ keyId: 1, pubX25519: 'used', consumedAt: now }]].map(keys => ({ keys })))('returns no one-time key when none remain', async ({ keys }) => {
    deps.DeviceModel.find.mockResolvedValue([{ ...device, oneTimePreKeys: keys }]);
    expect(await service.getUserChatDevices('r')).toMatchObject({ status: 200, data: [{ deviceId: 'phone', oneTimePreKey: null }] });
    expect(deps.DeviceModel.updateOne).not.toHaveBeenCalled();
  });
  it('claims an unconsumed key by matching the same array element', async () => {
    deps.DeviceModel.find.mockResolvedValue([device]);
    const result = await service.getUserChatDevices('r');
    expect(deps.DeviceModel.find).toHaveBeenCalledWith({ userId: 'r', revokedAt: null });
    expect(result).toMatchObject({ status: 200, data: [{ oneTimePreKey: { keyId: 2, pubX25519: 'fresh' } }] });
    expect(deps.DeviceModel.updateOne).toHaveBeenCalledWith({ _id: 'd', oneTimePreKeys: { $elemMatch: { keyId: 2, consumedAt: { $exists: false } } } }, { $set: { 'oneTimePreKeys.$.consumedAt': now } });
    expect((result.data as any[])[0]).not.toHaveProperty('oneTimePreKeys');
  });
  it.each([{ matchedCount: 0, modifiedCount: 0 }, { matchedCount: 1, modifiedCount: 0 }])('does not release a one-time key unless this call consumed it', async updateResult => {
    deps.DeviceModel.find.mockResolvedValue([device]); deps.DeviceModel.updateOne.mockResolvedValue(updateResult);
    expect(await service.getUserChatDevices('r')).toMatchObject({ data: [{ oneTimePreKey: null }] });
  });
  it('returns an empty device list', async () => { expect(await service.getUserChatDevices('u')).toEqual({ status: 200, data: [] }); });
  it('revokes only the specified owner device', async () => {
    expect(await service.revokeUserChatDevice({ userId: 'u', deviceId: 'phone' })).toEqual({ status: 200, data: null });
    expect(deps.DeviceModel.updateOne).toHaveBeenCalledWith({ userId: 'u', deviceId: 'phone' }, { $set: { revokedAt: now } });
  });
  it.each(['register', 'list', 'revoke'] as const)('returns a generic device %s failure', async op => {
    deps.DeviceModel.find.mockRejectedValue(new Error('db')); deps.DeviceModel.updateOne.mockRejectedValue(new Error('db'));
    const result = op === 'list' ? await service.getUserChatDevices('u') : op === 'revoke' ? await service.revokeUserChatDevice({ userId: 'u', deviceId: 'd' }) : await service.registerUserChatDevice({} as any);
    expect(result.status).toBe(500);
  });
  it.each(['chat', 'requests'])('paginates %s conversations and hydrates unique participants', async kind => {
    deps.ConversationModel.aggregate.mockResolvedValue([{ ...convo, lastMessage: { _id: 'm', fromUserId: 'r' } }, { ...convo, _id: 'c2' }]);
    const result = await service.getUserConversations({ userId: 'u', kind, page: 2, limit: 10 });
    const pipeline = deps.ConversationModel.aggregate.mock.calls[0][0];
    expect(pipeline[0].$match.$or).toEqual([{ 'initiator.id': 'u' }, { 'responder.id': 'u' }]);
    expect(pipeline).toContainEqual({ $skip: 10 }); expect(pipeline).toContainEqual({ $limit: 10 });
    expect(deps.publicUser).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ status: 200, data: [{ id: 'c', responder: { user: { id: 'r' } }, lastMessage: { id: 'm', sender: { id: 'r' } } }, { id: 'c2' }] });
  });
  it('handles an empty conversation list without profile lookups', async () => {
    expect(await service.getUserConversations({ userId: 'u', kind: 'chat', page: 1, limit: 10 })).toEqual({ status: 200, data: [] }); expect(deps.publicUser).not.toHaveBeenCalled();
  });
  it('handles a conversation-list failure', async () => {
    deps.ConversationModel.aggregate.mockRejectedValue(new Error('db'));
    expect((await service.getUserConversations({ userId: 'u', kind: 'chat', page: 1, limit: 10 })).status).toBe(500);
  });
  it.each([[], [message('3')], [message('3'), message('2'), message('1')]].map(rows => ({ rows })))('returns chronological messages with the oldest returned cursor', async ({ rows }) => {
    deps.limit.mockResolvedValue(rows);
    const result = await service.getConvoMessages({ conversationId: 'c', _id: { $lt: '4' } }, 2, 'u');
    expect(deps.ConversationModel.findOne).toHaveBeenCalledWith({ _id: 'c', $or: [{ 'initiator.id': 'u' }, { 'responder.id': 'u' }] });
    expect(deps.MessageModel.find).toHaveBeenCalledWith({ conversation: 'c', _id: { $lt: '4' } });
    expect(deps.limit).toHaveBeenCalledWith(3);
    expect(result).toMatchObject({ status: 200, data: { messages: rows.slice(0, 2).reverse().map(m => ({ id: m._id, sender: { id: 'u' } })), nextCursor: rows.length > 2 ? '2' : null } });
  });
  it('denies message access to nonmembers before querying messages', async () => {
    deps.ConversationModel.findOne.mockResolvedValue(null);
    expect((await service.getConvoMessages({ conversationId: 'c' }, 20, 'outsider')).status).toBe(404);
    expect(deps.MessageModel.find).not.toHaveBeenCalled();
  });
  it('handles message query failure', async () => {
    deps.limit.mockRejectedValue(new Error('db')); expect((await service.getConvoMessages({ conversationId: 'c' }, 20, 'u')).status).toBe(500);
  });
  it('scopes a seen-only update to the requested conversation', async () => {
    expect((await service.updateUserConversations({ recipientId: 'u', convoId: 'c', isSeen: true })).status).toBe(200);
    expect(deps.MessageModel.updateMany).toHaveBeenCalledWith({ toUserId: 'u', conversation: 'c', 'seen.userId': { $ne: 'u' } }, { $push: { seen: { userId: 'u', seenAt: now } } });
  });
  it('marks incoming messages seen across conversations when no ID is supplied', async () => {
    await service.updateUserConversations({ recipientId: 'u', isSeen: true });
    expect(deps.MessageModel.updateMany).toHaveBeenCalledWith({ toUserId: 'u', 'seen.userId': { $ne: 'u' } }, { $push: { seen: { userId: 'u', seenAt: now } } });
  });
  it('marks only unread incoming messages read', async () => {
    await service.updateUserConversations({ recipientId: 'u', convoId: 'c', isRead: true });
    expect(deps.MessageModel.updateMany).toHaveBeenCalledWith({ toUserId: 'u', conversation: 'c', 'read.userId': { $ne: 'u' } }, { $push: { read: { userId: 'u', readAt: now } } });
  });
  it('updates read and seen receipts independently to avoid duplicating existing receipts', async () => {
    await service.updateUserConversations({ recipientId: 'u', convoId: 'c', isRead: true, isSeen: true });
    expect(deps.MessageModel.updateMany.mock.calls).toEqual([
      [{ toUserId: 'u', conversation: 'c', 'read.userId': { $ne: 'u' } }, { $push: { read: { userId: 'u', readAt: now } } }],
      [{ toUserId: 'u', conversation: 'c', 'seen.userId': { $ne: 'u' } }, { $push: { seen: { userId: 'u', seenAt: now } } }],
    ]);
  });
  it('handles receipt update failure', async () => {
    deps.MessageModel.updateMany.mockRejectedValue(new Error('db')); expect((await service.updateUserConversations({ recipientId: 'u' })).status).toBe(500);
  });
});
it('returns anonymous recipient profile and devices', async () => {
  deps.DeviceModel.find.mockResolvedValue([device]); expect(await anonymous.getRecipient('r')).toMatchObject({ status: 200, data: { recipient: { id: 'r' }, recipientDevices: [device] } });
});
it('handles anonymous recipient lookup failure', async () => {
  deps.publicUser.mockRejectedValue(new Error('db')); expect((await anonymous.getRecipient('r')).status).toBe(500);
});
it('returns a recipient without messages when no conversation exists', async () => {
  expect(await chat.getUserAndRecipientMessages('u', 'r')).toMatchObject({ status: 200, data: { recipient: { id: 'r' }, messages: [] } }); expect(deps.MessageModel.find).not.toHaveBeenCalled();
});
it('loads the latest 30 recipient messages chronologically', async () => {
  deps.ConversationModel.aggregate.mockResolvedValue([convo]); deps.limit.mockResolvedValue([message('2', 'r'), message('1')]);
  expect(await chat.getUserAndRecipientMessages('u', 'r')).toMatchObject({ status: 200, data: { messages: [{ id: '1', sender: { id: 'u' } }, { id: '2', sender: { id: 'r' } }], convo: { id: 'c' } } });
  expect(deps.limit).toHaveBeenCalledWith(30);
});
it('handles recipient history failure', async () => {
  deps.ConversationModel.aggregate.mockRejectedValue(new Error('db')); expect((await chat.getUserAndRecipientMessages('u', 'r')).status).toBe(500);
});
