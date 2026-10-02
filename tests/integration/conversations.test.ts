import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { ConversationModel, DeviceModel, MessageModel } from '@/db/models';
vi.mock('@/services/v1/utils', () => ({ getPublicUser: async (id: string) => ({ id, name: id }) }));
import * as chat from '@/services/v1/conversations';
import { ConvoKind } from '@/types';
beforeAll(async () => { await mongoose.connect('mongodb://127.0.0.1:17017/kwonserver_test'); await Promise.all([ConversationModel.init(), DeviceModel.init(), MessageModel.init()]); });
beforeEach(async () => { await Promise.all([ConversationModel.deleteMany({}), DeviceModel.deleteMany({}), MessageModel.deleteMany({})]); });
afterAll(async () => { await mongoose.disconnect(); });
it('reuses conversations containing participant metadata in either direction', async () => {
  expect((await chat.createConversation({ senderId: 'u', recipientId: 'r', kind: ConvoKind.CHAT })).status).toBe(201);
  expect((await chat.createConversation({ senderId: 'r', recipientId: 'u', kind: ConvoKind.CHAT })).status).toBe(200);
  expect(await ConversationModel.countDocuments()).toBe(1);
});
it('releases a one-time key to exactly one competing request', async () => {
  await chat.registerUserChatDevice({ userId: 'u', deviceId: 'phone', identityPubEd25519: 'ed', identityPubX25519: 'x', signedPreKeyPubX25519: 'signed', signedPreKeySignature: 'sig', oneTimePreKeys: [{ keyId: 1, pubX25519: 'key' }] });
  const results = await Promise.all(Array.from({ length: 8 }, () => chat.getUserChatDevices('u')));
  expect(results.every(r => r.status === 200)).toBe(true);
  expect(results.flatMap(r => r.data as any[]).filter(d => d.oneTimePreKey)).toHaveLength(1);
});
it('persists revocation and excludes the device from subsequent discovery', async () => {
  await DeviceModel.create({ userId: 'u', deviceId: 'phone' });
  expect((await chat.revokeUserChatDevice({ userId: 'u', deviceId: 'phone' })).status).toBe(200);
  expect(await chat.getUserChatDevices('u')).toEqual({ status: 200, data: [] });
  expect((await DeviceModel.findOne({ userId: 'u' }))?.revokedAt).toBeInstanceOf(Date);
});
it('paginates actual message records without overlap and rejects outsiders', async () => {
  const convo = await ConversationModel.create({ initiator: { id: 'u' }, responder: { id: 'r', acceptedAt: new Date() } });
  const records = await MessageModel.create(Array.from({ length: 5 }, (_, i) => ({ conversation: convo._id, fromUserId: 'r', toUserId: 'u', fromDeviceId: 'a', toDeviceId: 'b', ciphertext: `encrypted-${i}`, nonce: 'nonce', header: {} })));
  const first: any = await chat.getConvoMessages({ conversationId: String(convo._id) }, 2, 'u');
  const second: any = await chat.getConvoMessages({ conversationId: String(convo._id), _id: { $lt: first.data.nextCursor } }, 2, 'u');
  expect(first.status).toBe(200); expect(second.status).toBe(200);
  expect(new Set([...first.data.messages, ...second.data.messages].map(m => m.id)).size).toBe(4);
  expect((await chat.getConvoMessages({ conversationId: String(convo._id) }, 2, 'outsider')).status).toBe(404);
  await chat.updateUserConversations({ recipientId: 'u', convoId: String(convo._id), isSeen: true });
  await chat.updateUserConversations({ recipientId: 'u', convoId: String(convo._id), isSeen: true, isRead: true });
  await chat.updateUserConversations({ recipientId: 'u', convoId: String(convo._id), isSeen: true, isRead: true });
  for (const message of await MessageModel.find({ _id: { $in: records.map(r => r._id) } })) {
    expect(message.read).toHaveLength(1); expect(message.seen).toHaveLength(1);
  }
});
it('applies conversation list limits against MongoDB', async () => {
  await ConversationModel.create(['a', 'b', 'c'].map(id => ({ initiator: { id: 'u' }, responder: { id, acceptedAt: new Date() }, kind: ConvoKind.CHAT })));
  const result = await chat.getUserConversations({ userId: 'u', kind: 'chat', page: 2, limit: 2 });
  expect(result.status).toBe(200); expect(result.data).toHaveLength(1);
});
