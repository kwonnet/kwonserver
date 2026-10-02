import { beforeEach, describe, expect, it, vi } from 'vitest';
import { response, resetMocks } from './fixtures';
const services = vi.hoisted(() => ({ createConversation: vi.fn(), registerUserChatDevice: vi.fn(), getUserChatDevices: vi.fn(), getUserConversations: vi.fn(),
  getUserAndRecipientMessages: vi.fn(), revokeUserChatDevice: vi.fn(), getConvoMessages: vi.fn(), updateUserConversations: vi.fn(), getRecipient: vi.fn() }));
const sodium = vi.hoisted(() => ({ crypto_sign_verify_detached: vi.fn(), from_base64: vi.fn(), base64_variants: { ORIGINAL: 1 } }));
vi.mock('@/services/v1/conversations', () => services);
vi.mock('@/services/v1/anonymous', () => services);
vi.mock('@/lib/sodium', () => ({ initSodium: async () => sodium }));
import * as chat from '@/controllers/v1/conversations';
import * as anonymous from '@/controllers/v1/anonymous';
import { ConvoKind } from '@/types';
const request = (overrides = {}): any => ({ user: { id: 'u' }, body: {}, params: {}, query: {}, ...overrides });
const keys = { deviceId: 'phone', identityPubEd25519: 'ed', identityPubX25519: 'x', signedPreKeyPubX25519: 'signed', signedPreKeySignature: 'sig' };
beforeEach(() => {
  resetMocks(services); resetMocks(sodium); vi.spyOn(console, 'log').mockImplementation(() => {});
  Object.values(services).forEach(mock => mock.mockResolvedValue({ status: 200, data: { ok: true } }));
  sodium.from_base64.mockImplementation(v => `decoded:${v}`); sodium.crypto_sign_verify_detached.mockReturnValue(true);
});
for (const [name, c] of [['chat', chat], ['anonymous', anonymous]] as const) describe(name, () => {
  it.each([
    {}, { senderId: 'victim', recipientId: 'r', kind: ConvoKind.CHAT }, { senderId: 'u', recipientId: 'u', kind: ConvoKind.ANONYMOUS },
  ])('rejects malformed or unauthorized conversation creation', async body => {
    const res = response(); await c.createConversationController(request({ body }), res); expect(res.statusCode).toBe(400); expect(services.createConversation).not.toHaveBeenCalled();
  });
  it('creates an authenticated conversation and propagates status', async () => {
    const body = { senderId: 'u', recipientId: 'r', kind: ConvoKind.CHAT }; services.createConversation.mockResolvedValue({ status: 201, data: { id: 'c' } });
    const res = response(); await c.createConversationController(request({ body }), res);
    expect(services.createConversation).toHaveBeenCalledWith(body); expect(res.statusCode).toBe(201); expect(res.body).toEqual({ id: 'c' });
  });
  it('rejects malformed device registration before verifying keys', async () => {
    const res = response(); await c.registerUserChatDeviceController(request(), res); expect(res.statusCode).toBe(400); expect(sodium.crypto_sign_verify_detached).not.toHaveBeenCalled();
  });
  it('rejects an invalid key signature before persistence', async () => {
    sodium.crypto_sign_verify_detached.mockReturnValue(false); const res = response();
    await c.registerUserChatDeviceController(request({ body: keys }), res); expect(res.statusCode).toBe(400); expect(services.registerUserChatDevice).not.toHaveBeenCalled();
  });
  it('verifies the key signature and binds the device to the authenticated user', async () => {
    const res = response(); await c.registerUserChatDeviceController(request({ body: { ...keys, userId: 'victim' } }), res);
    expect(sodium.crypto_sign_verify_detached).toHaveBeenCalledWith('decoded:sig', 'decoded:signed', 'decoded:ed');
    expect(services.registerUserChatDevice).toHaveBeenCalledWith({ ...keys, userId: 'u', oneTimePreKeys: [] }); expect(res.statusCode).toBe(200);
  });
  it('handles malformed encoded keys without saving a device', async () => {
    sodium.from_base64.mockImplementation(() => { throw new Error('encoding'); }); const res = response();
    await c.registerUserChatDeviceController(request({ body: keys }), res); expect(res.statusCode).toBe(500); expect(services.registerUserChatDevice).not.toHaveBeenCalled();
  });
  it.each([undefined, 'r'])('requires a target user for device retrieval: %s', async id => {
    const res = response(); await c.getUserChatDevicesController(request({ params: { id } }), res); expect(res.statusCode).toBe(id ? 200 : 400);
    if (id) expect(services.getUserChatDevices).toHaveBeenCalledWith('r'); else expect(services.getUserChatDevices).not.toHaveBeenCalled();
  });
  it('refuses to list another user conversations', async () => {
    const res = response(); await c.getUserConversationsController(request({ params: { id: 'victim' }, query: { kind: 'chat' } }), res);
    expect(res.statusCode).toBe(400); expect(services.getUserConversations).not.toHaveBeenCalled();
  });
  it('validates conversation-list queries', async () => {
    const res = response(); await c.getUserConversationsController(request({ params: { id: 'u' }, query: { limit: 'bad' } }), res);
    expect(res.statusCode).toBe(400); expect(services.getUserConversations).not.toHaveBeenCalled();
  });
  it('converts list pagination and scopes the user', async () => {
    const res = response(); await c.getUserConversationsController(request({ params: { id: 'u' }, query: { kind: 'chat', page: '2', limit: '10' } }), res);
    expect(services.getUserConversations).toHaveBeenCalledWith({ userId: 'u', kind: 'chat', page: 2, limit: 10 }); expect(res.statusCode).toBe(200);
  });
  it('uses the deviceId route parameter when revoking a device', async () => {
    const res = response(); await c.revokeUserChatDeviceController(request({ params: { deviceId: 'phone' } }), res);
    expect(services.revokeUserChatDevice).toHaveBeenCalledWith({ deviceId: 'phone', userId: 'u' }); expect(res.statusCode).toBe(200);
  });
  it('rejects a missing device ID', async () => {
    const res = response(); await c.revokeUserChatDeviceController(request(), res); expect(res.statusCode).toBe(400); expect(services.revokeUserChatDevice).not.toHaveBeenCalled();
  });
  it.each([{ query: {}, limit: 20 }, { query: { limit: '200', cursor: 'm' }, limit: 100 }, { query: { limit: '-5' }, limit: 1 }, { query: { limit: 'nope' }, limit: 20 }])('passes message ownership and bounded pagination', async ({ query, limit }) => {
    const res = response(); await c.getConvoMessagesController(request({ params: { id: 'c' }, query }), res);
    expect(services.getConvoMessages).toHaveBeenCalledWith({ conversationId: 'c', ...(query.cursor ? { _id: { $lt: 'm' } } : {}) }, limit, 'u'); expect(res.statusCode).toBe(200);
  });
  it('rejects message retrieval without a conversation ID', async () => {
    const res = response(); await c.getConvoMessagesController(request(), res); expect(res.statusCode).toBe(400); expect(services.getConvoMessages).not.toHaveBeenCalled();
  });
  it.each([{ body: {}, status: 400 }, { body: { userId: 'victim' }, status: 403 }])('rejects invalid receipt updates', async ({ body, status }) => {
    const res = response(); await c.updateUserConvoController(request({ body }), res); expect(res.statusCode).toBe(status); expect(services.updateUserConversations).not.toHaveBeenCalled();
  });
  it('binds receipt updates to the authenticated recipient', async () => {
    const res = response(); await c.updateUserConvoController(request({ body: { userId: 'u', convoId: 'c', isRead: true, isSeen: true } }), res);
    expect(services.updateUserConversations).toHaveBeenCalledWith({ recipientId: 'u', convoId: 'c', isRead: true, isSeen: true }); expect(res.statusCode).toBe(200);
  });
  for (const [controller, service, req] of [
    [c.createConversationController, services.createConversation, request({ body: { senderId: 'u', recipientId: 'r', kind: ConvoKind.CHAT } })],
    [c.registerUserChatDeviceController, services.registerUserChatDevice, request({ body: keys })],
    [c.getUserChatDevicesController, services.getUserChatDevices, request({ params: { id: 'r' } })],
    [c.getUserConversationsController, services.getUserConversations, request({ params: { id: 'u' }, query: { kind: 'chat' } })],
    [c.revokeUserChatDeviceController, services.revokeUserChatDevice, request({ params: { deviceId: 'phone' } })],
    [c.getConvoMessagesController, services.getConvoMessages, request({ params: { id: 'c' } })],
  ] as const) it(`${controller.name} handles service exceptions`, async () => {
    service.mockRejectedValue(new Error('private detail')); const res = response(); await controller(req, res); expect(res.statusCode).toBe(500); expect(res.body).not.toContain('private detail');
  });
});
it.each([{ params: {}, status: 404 }, { params: { id: 'r' }, status: 200 }])('validates anonymous recipient retrieval', async ({ params, status }) => {
  const res = response(); await anonymous.getRecipientController(request({ params }), res); expect(res.statusCode).toBe(status);
  if (status === 200) expect(services.getRecipient).toHaveBeenCalledWith('r');
});
it('handles anonymous recipient failure', async () => {
  services.getRecipient.mockRejectedValue(new Error('db')); const res = response(); await anonymous.getRecipientController(request({ params: { id: 'r' } }), res); expect(res.statusCode).toBe(500);
});
it.each([{ params: { id: 'victim', recipientId: 'r' }, status: 403 }, { params: { id: 'u' }, status: 404 }, { params: { id: 'u', recipientId: 'r' }, status: 200 }])('checks recipient-history ownership and IDs', async ({ params, status }) => {
  const res = response(); await chat.getUserAndRecipientMessagesController(request({ params }), res); expect(res.statusCode).toBe(status);
  if (status === 200) expect(services.getUserAndRecipientMessages).toHaveBeenCalledWith('u', 'r'); else expect(services.getUserAndRecipientMessages).not.toHaveBeenCalled();
});
it('handles recipient-history failure', async () => {
  services.getUserAndRecipientMessages.mockRejectedValue(new Error('db')); const res = response(); await chat.getUserAndRecipientMessagesController(request({ params: { id: 'u', recipientId: 'r' } }), res); expect(res.statusCode).toBe(500);
});
