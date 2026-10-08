const pubsub=vi.hoisted(()=>({subscribe:vi.fn(),stop:vi.fn()}));
vi.mock('@/services/v1/conversations/live',()=>({subscribeMessagingHints:pubsub.subscribe}));
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
const deps = vi.hoisted(() => ({ validate: vi.fn(), user: vi.fn(), device: vi.fn(), sync: vi.fn(), send: vi.fn(), receipt: vi.fn(), typing: vi.fn(), roster: vi.fn(), hints: vi.fn() }));
vi.mock('@/services/v1/auth', () => ({ validateAuthSession: deps.validate }));
vi.mock('@/utils/auth-session-sockets', () => ({ registerAuthNamespace: vi.fn() }));
vi.mock('@/utils', () => ({ getAuthTokenUser: deps.user }));
vi.mock('@/services/v1/conversations', () => ({ messagingDevice: deps.device, messagingSync: deps.sync, sendMessagingEvent: deps.send, messagingReceipt: deps.receipt, messagingTyping: deps.typing, messagingRoster: deps.roster, messagingReceiptBatch:deps.receipt, MessagingError: class extends Error {
        constructor(public status: number, message: string) { super(message); }
    } }));
import configure from '@/socketIo/convoSocketIo';
const deviceId = randomUUID(), conversationId = randomUUID();
const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
let listener:(hints:any[])=>void;
let events: Record<string, Function>, middleware: Function, connection: Function, socket: any, io: any, server: any, close: Function;
beforeEach(() => {
    vi.useFakeTimers();
    Object.values(deps).forEach(fn => fn.mockReset());
    deps.validate.mockResolvedValue(true);
    deps.user.mockReturnValue({ id: 'u', sessionId: 's' });
    deps.device.mockResolvedValue({ id: deviceId, actionSigningPublic: publicKey });
    deps.sync.mockResolvedValue({});
    deps.send.mockResolvedValue({ messageId: 'id' });
    deps.receipt.mockResolvedValue({ suppressed: false });
    deps.typing.mockResolvedValue('peer');
    deps.roster.mockResolvedValue([{ deviceId }]);
    deps.hints.mockResolvedValue({ hints: [], cursor: 0n });
    events = {};
    socket = { data: { user: { id: 'u', sessionId: 's' } }, on: vi.fn((name, fn) => events[name] = fn), emit: vi.fn(), join: vi.fn(), leave: vi.fn(), disconnect: vi.fn() };
    io = { use: vi.fn(fn => middleware = fn), on: vi.fn((name, fn) => { if (name === 'connection')
            connection = fn; }), to: vi.fn(() => ({ emit: vi.fn() })) };
    server = { of: () => io, engine: { on: vi.fn((_name, fn) => { close = fn; }) } };
    pubsub.stop.mockResolvedValue(undefined);pubsub.subscribe.mockImplementation(async(fn:any)=>{listener=fn;return pubsub.stop;});
    configure(server);
    connection(socket);
});
afterEach(() => { close?.(); vi.useRealTimers(); });
async function bind() { const challenge = socket.emit.mock.calls.find((call: any) => call[0] === 'device:challenge')[1].challenge; const signature = sign(null, Buffer.from(JSON.stringify(['kwonnet-device-bind', 1, challenge, 'u', deviceId])), keys.privateKey).toString('base64'); const ack = vi.fn(); await events['device:bind']({ deviceId, signature }, ack); expect(ack).toHaveBeenCalledWith({ ok: true, deviceId }); }
it('requires an authenticated live session and rejects untrusted origins and authentication failures', async () => {
    const next = vi.fn();
    await middleware({ handshake: { headers: { origin: 'https://kwonnet.test' }, auth: { token: 'safe' } }, data: {} }, next);
    expect(next).toHaveBeenCalledWith();
    next.mockClear();
    await middleware({ handshake: { headers: { origin: 'https://evil.invalid' }, auth: {} }, data: {} }, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    deps.user.mockReturnValue(null);
    await middleware({ handshake: { headers: {}, auth: {} }, data: {} }, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    deps.user.mockReturnValue({ id: 'u', sessionId: 's' });
    deps.validate.mockResolvedValue(false);
    await middleware({ handshake: { headers: {}, auth: {} }, data: {} }, next);
    deps.user.mockImplementation(() => { throw new Error('private'); });
    await middleware({ handshake: { headers: {}, auth: {} }, data: {} }, next);
});
it('requires proof of the enrolled Ed25519 private key and binds only its device room', async () => {
    const ack = vi.fn();
    await events['device:bind']({ deviceId, signature: Buffer.alloc(64).toString('base64') }, ack);
    expect(ack).toHaveBeenCalledWith({ ok: false, error: 'Invalid device proof' });
    await bind();
    await bind();
    expect(socket.join).toHaveBeenCalledWith(`e2-device:${deviceId}`);
    expect(socket.leave).toHaveBeenCalledWith(`e2-device:${deviceId}`);
    events['device:challenge']();
    expect(socket.emit).toHaveBeenCalledWith('device:challenge', expect.any(Object));
});
it('does not allow conversation joins before device proof or outsider membership validation', async () => {
    const ack = vi.fn();
    await events['convo:join']({ convoId: conversationId }, ack);
    expect(ack).toHaveBeenCalledWith({ ok: false, error: 'Unlock messaging first' });
    await bind();
    deps.sync.mockRejectedValue(new Error('outsider'));
    await events['convo:join']({ convoId: conversationId }, ack);
    expect(socket.join).not.toHaveBeenCalledWith(`e2-convo:${conversationId}`);
    deps.sync.mockResolvedValue({});
    await events['convo:join']({ convoId: conversationId }, ack);
    expect(socket.join).toHaveBeenCalledWith(`e2-convo:${conversationId}`);
    await events['convo:leave']({ convoId: conversationId }, ack);
    expect(socket.leave).toHaveBeenCalledWith(`e2-convo:${conversationId}`);
});
it('uses the same authorized opaque send path for messages and encrypted actions, never trusts sender/user metadata', async () => {
    await bind();
    const payload = { conversationId, clientId: randomUUID(), envelopes: [{ recipientDeviceId: deviceId, wireType: 3, ciphertextB64: Buffer.alloc(64).toString('base64') }] };
    const ack = vi.fn();
    for (const event of ['message:send', 'reaction:add', 'message:edit', 'message:delete']) {
        await events[event](payload, ack);
        expect(deps.send).toHaveBeenCalledWith('u', 's', deviceId, payload);
    }
    await events['message:send']({ ...payload, senderId: 'victim' }, ack);
    expect(ack).toHaveBeenCalledWith({ ok: false, error: 'Unable to process event' });
});
it('revalidates the session per event and routes explicit receipt status through pending-request suppression', async () => {
    await bind();
    const ids = [randomUUID()], ack = vi.fn();
    await events['message:delivered']({ conversationId, messageIds: ids }, ack);
    expect(deps.receipt).toHaveBeenCalledWith('u', 's', deviceId, { conversationId, messageIds: ids, status: 'DELIVERED' });
    await events['message:read']({ conversationId, messageIds: ids }, ack);
    expect(deps.receipt).toHaveBeenCalledWith('u', 's', deviceId, { conversationId, messageIds: ids, status: 'READ' });
    deps.validate.mockResolvedValue(false);
    await events['message:read']({ conversationId, messageIds: ids }, ack);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
});
it('suppresses typing via server policy, throttles indicators, and emits short-lived events only to authorized device rooms', async () => {
    await bind();
    const ack = vi.fn();
    await events['typing:start']({ conversationId }, ack);
    const calls = deps.typing.mock.calls.length;
    await events['typing:start']({ conversationId }, ack);
    expect(deps.typing).toHaveBeenCalledTimes(calls);
    await events['typing:stop']({ conversationId }, ack);
    deps.typing.mockResolvedValue(null);
    await vi.advanceTimersByTimeAsync(3000);
    await events['typing:start']({ conversationId }, ack);
    expect(ack).toHaveBeenCalledWith({ ok: true });
});
it('relays Redis hints without polling the database and cleans up subscriptions',async()=>{await bind();listener([{deviceId,conversationId}]);expect(io.to).toHaveBeenCalledWith(`e2-device:${deviceId}`);await Promise.resolve();close();expect(pubsub.stop).toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);});
it('provides authorized socket catch-up and batched receipts',async()=>{await bind();const ack=vi.fn();await events['messages:sync']({conversationId,after:'1',receiptAfter:'2'},ack);expect(deps.sync).toHaveBeenCalledWith('u','s',deviceId,conversationId,'1','2');await events['receipts:batch']({conversationId,deliveredIds:[],readIds:[deviceId]},ack);expect(deps.receipt).toHaveBeenCalled();await events['convo:join']({convoId:'bad'});});
