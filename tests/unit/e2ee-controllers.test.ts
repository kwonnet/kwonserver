import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { response } from './fixtures';
const services = vi.hoisted(() => Object.fromEntries(['enrollMessagingDevice', 'messagingRoster', 'claimMessagingPreKey', 'createMessagingConversation', 'listMessagingConversations', 'messagingPeer', 'sendMessagingEvent', 'messagingSync', 'messagingReceipt', 'resolveMessagingRequest', 'deleteMessagingForMe', 'revokeMessagingDevice', 'putMessagingBlob', 'getMessagingBlob'].map(name => [name, vi.fn()])));
vi.mock('@/services/v1/conversations', () => ({ ...services, MessagingError: class extends Error {
        constructor(public status: number, message: string) { super(message); }
    } }));
import * as c from '@/controllers/v1/conversations';
import { MessagingError } from '@/services/v1/conversations';
const device = randomUUID(), room = randomUUID(), message = randomUUID();
const req = (overrides: any = {}) => ({ user: { id: 'u', sessionId: 's' }, params: { id: room, deviceId: device, recipientId: 'r', blobId: message, messageId: message }, query: {}, headers: { 'x-messaging-device': device }, body: {}, ...overrides }) as any;
const enrollment = { deviceId: device, signalDeviceId: 1, registrationId: 1, identityPublic: Buffer.alloc(33).toString('base64'), actionSigningPublic: Buffer.alloc(32).toString('base64'), signedPreKey: { keyId: 1, publicKey: Buffer.alloc(33).toString('base64'), signature: Buffer.alloc(64).toString('base64') }, preKeys: [] };
const send = { conversationId: room, clientId: message, envelopes: [{ recipientDeviceId: device, wireType: 3, ciphertextB64: Buffer.alloc(64).toString('base64') }] };
const cases = [
    [c.messagingEnrollController, 'enrollMessagingDevice', { body: enrollment }],
    [c.messagingRosterController, 'messagingRoster', {}],
    [c.messagingClaimController, 'claimMessagingPreKey', { body: { claimId: message } }],
    [c.messagingCreateController, 'createMessagingConversation', { body: { recipientId: 'r' } }],
    [c.messagingListController, 'listMessagingConversations', { params: { id: 'u' } }],
    [c.messagingPeerController, 'messagingPeer', { params: { id: 'u', recipientId: 'r' } }],
    [c.messagingSendController, 'sendMessagingEvent', { body: send }],
    [c.messagingSyncController, 'messagingSync', {}],
    [c.messagingReceiptController, 'messagingReceipt', { body: { conversationId: room, messageIds: [message], status: 'READ' } }],
    [c.messagingRequestController, 'resolveMessagingRequest', { body: { action: 'accept' } }],
    [c.messagingDeleteController, 'deleteMessagingForMe', {}],
    [c.messagingRevokeController, 'revokeMessagingDevice', {}],
    [c.messagingUploadController, 'putMessagingBlob', { body: Buffer.alloc(64) }],
] as const;
beforeEach(() => { Object.values(services).forEach(fn => fn.mockReset().mockResolvedValue({ ok: true })); });
for (const [controller, name, input] of cases) {
    it(`${name} validates transport and returns no-store actor-bound output`, async () => { const res = response(); await controller(req(input), res); expect(res.body).toEqual({ ok: true }); expect(services[name]).toHaveBeenCalled(); expect(res.headers['Cache-Control']).toBe('no-store'); });
    it(`${name} maps operational failures without leaking raw errors`, async () => { services[name].mockRejectedValue(new Error('private value')); const res = response(); await controller(req(input), res); expect(res.statusCode).toBe(500); expect(res.body).not.toContain('private value'); });
}
it('rejects cross-user folder and history queries', async () => { for (const fn of [c.messagingListController, c.messagingPeerController]) {
    const res = response();
    await fn(req(), res);
    expect(res.statusCode).toBe(403);
} });
it('requires a modern auth session and valid device ID', async () => { let res = response(); await c.messagingSyncController(req({ user: { id: 'u' } }), res); expect(res.statusCode).toBe(401); res = response(); await c.messagingSyncController(req({ headers: {} }), res); expect(res.statusCode).toBe(400); });
it('supports explicit receipt cursors and bounded folder parameters', async () => { await c.messagingSyncController(req({ query: { after: '9', receiptAfter: '10' } }), response()); expect(services.messagingSync).toHaveBeenCalledWith('u', 's', device, room, '9', '10'); await c.messagingListController(req({ params: { id: 'u' }, query: { kind: 'requests', page: '2', limit: '500' } }), response()); expect(services.listMessagingConversations).toHaveBeenCalledWith('u', 'requests', 2, 100); });
it('rejects plaintext additions, malformed key material and invalid payload bounds', async () => {
    for (const body of [{ ...enrollment, identityPublic: 'invalid' }, { ...enrollment, identityPublic: 'YQ==' }, { ...enrollment, privateKey: 'never send' }]) {
        const res = response();
        await c.messagingEnrollController(req({ body }), res);
        expect(res.statusCode).toBe(400);
    }
    const res = response();
    await c.messagingSendController(req({ body: { ...send, text: 'plaintext' } }), res);
    expect(res.statusCode).toBe(400);
});
it('maps known messaging errors to their bounded status', async () => { services.createMessagingConversation.mockRejectedValue(new MessagingError(409, 'Device changed')); const res = response(); await c.messagingCreateController(req({ body: { recipientId: 'r' } }), res); expect(res.statusCode).toBe(409); expect(res.body).toBe('Device changed'); });
it('rejects nonbinary attachment uploads before the size check in services', async () => { await c.messagingUploadController(req({ body: { ciphertext: 'not binary' } }), response()); expect(services.putMessagingBlob).toHaveBeenCalledWith('u', 's', device, room, message, Buffer.alloc(0)); });
it('downloads only opaque attachment bytes with safe private headers and sanitizes all failures', async () => { services.getMessagingBlob.mockResolvedValue(Buffer.alloc(64)); const res = response(); res.set = vi.fn(); await c.messagingDownloadController(req(), res); expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ 'Cache-Control': 'private, no-store', 'Content-Type': 'application/octet-stream' })); expect(res.body).toEqual(Buffer.alloc(64)); services.getMessagingBlob.mockRejectedValue(new MessagingError(404, 'gone')); await c.messagingDownloadController(req(), res); expect(res.statusCode).toBe(404); services.getMessagingBlob.mockRejectedValue(new Error('private')); await c.messagingDownloadController(req(), res); expect(res.statusCode).toBe(400); expect(res.body).toBe('Attachment unavailable'); });
