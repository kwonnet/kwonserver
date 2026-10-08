import { validateAuthSession } from '@/services/v1/auth';
import { registerAuthNamespace } from '@/utils/auth-session-sockets';
import { getAuthTokenUser } from '@/utils';
import { allowedOrigins } from '@/config';
import logger from '@/logger';
import { safeError } from '@/logger/sanitize';
import { Server } from 'socket.io';
import { randomBytes, createPublicKey, verify } from 'node:crypto';
import { z } from 'zod/v3';
import * as messaging from '@/services/v1/conversations';
import { SendSchema, ReceiptSchema } from '@/services/v1/conversations/e2ee-contracts';
const uuid = z.string().uuid();
export default function convoSocketIo(server: Server) {
    const io = server.of('/conversations');
    registerAuthNamespace(io);
    io.use(async (socket, next) => {
        try {
            const origin = socket.handshake.headers.origin;
            if (origin && !allowedOrigins.includes(origin))
                return next(new Error('Origin not allowed'));
            const user = getAuthTokenUser(socket.handshake.auth?.token);
            if (!user?.sessionId || !await validateAuthSession(user))
                return next(new Error('Sign in again'));
            socket.data.user = user;
            next();
        }
        catch (error) {
            logger.warn({ event: 'messaging_socket_auth_failed', err: safeError(error) }, 'Messaging socket authentication failed');
            next(new Error('Unauthenticated'));
        }
    });
    const boundDevices = new Map<string, number>();
    let hintCursor = 0n;
    let pumping = false;
    const timer = setInterval(async () => {
        if (pumping || !boundDevices.size)
            return;
        pumping = true;
        try {
            const result = await messaging.messagingSocketHints([...boundDevices.keys()], hintCursor);
            hintCursor = result.cursor;
            for (const hint of result.hints)
                io.to(`e2-device:${hint.deviceId}`).emit('message:available', { conversationId: hint.conversationId });
        }
        catch (error) {
            logger.warn({ event: 'messaging_hint_relay_failed', err: safeError(error) }, 'Messaging live hints unavailable; durable sync remains active');
        }
        finally {
            pumping = false;
        }
    }, 1000);
    timer.unref();
    server.engine.on('close', () => clearInterval(timer));
    io.on('connection', socket => {
        const user = socket.data.user;
        const challenge = randomBytes(32).toString('base64');
        socket.emit('device:challenge', { challenge });
        socket.on('device:challenge', () => socket.emit('device:challenge', { challenge }));
        let deviceId: string | undefined;
        let lastTyping = 0;
        const handle = (name: string, work: (body: any) => Promise<any>) => socket.on(name, async (body, ack) => {
            try {
                if (!await validateAuthSession(user)) {
                    socket.disconnect(true);
                    throw new messaging.MessagingError(401, 'Session expired');
                }
                const result = await work(body);
                if (typeof ack === 'function')
                    ack({ ok: true, ...result });
            }
            catch (error) {
                logger.warn({ event: 'messaging_socket_event_failed', operation: name, userId: user.id, err: safeError(error) }, 'Messaging socket event failed');
                if (typeof ack === 'function')
                    ack({ ok: false, error: error instanceof messaging.MessagingError ? error.message : 'Unable to process event' });
            }
        });
        handle('device:bind', async (body) => {
            const input = z.object({ deviceId: uuid, signature: z.string().max(100) }).strict().parse(body);
            const device = await messaging.messagingDevice(user.id, user.sessionId, input.deviceId);
            const pub = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(device.actionSigningPublic)]), format: 'der', type: 'spki' });
            const bytes = Buffer.from(JSON.stringify(['kwonnet-device-bind', 1, challenge, user.id, input.deviceId]));
            if (!verify(null, bytes, pub, Buffer.from(input.signature, 'base64')))
                throw new messaging.MessagingError(403, 'Invalid device proof');
            if (deviceId) {
                boundDevices.set(deviceId, Math.max(0, (boundDevices.get(deviceId) ?? 1) - 1));
                await socket.leave(`e2-device:${deviceId}`);
            }
            deviceId = device.id;
            boundDevices.set(deviceId, (boundDevices.get(deviceId) ?? 0) + 1);
            await socket.join(`e2-device:${deviceId}`);
            return { deviceId };
        });
        socket.on('disconnect', () => { if (deviceId) {
            const n = (boundDevices.get(deviceId) ?? 1) - 1;
            if (n)
                boundDevices.set(deviceId, n);
            else
                boundDevices.delete(deviceId);
        } });
        const bound = () => { if (!deviceId)
            throw new messaging.MessagingError(403, 'Unlock messaging first'); return deviceId; };
        handle('convo:join', async (body) => { const id = uuid.parse(body.convoId); await messaging.messagingSync(user.id, user.sessionId, bound(), id, '0'); await socket.join(`e2-convo:${id}`); return {}; });
        handle('convo:leave', async (body) => { await socket.leave(`e2-convo:${uuid.parse(body.convoId)}`); return {}; });
        handle('message:send', async (body) => {
            const input = SendSchema.parse(body);
            const result = await messaging.sendMessagingEvent(user.id, user.sessionId, bound(), input);
            // Hint contains no ciphertext. Device-scoped durable sync is authoritative across API instances.
            for (const envelope of input.envelopes)
                io.to(`e2-device:${envelope.recipientDeviceId}`).emit('message:available', { conversationId: input.conversationId });
            return result;
        });
        for (const event of ['message:delivered', 'message:read'])
            handle(event, async (body) => messaging.messagingReceipt(user.id, user.sessionId, bound(), ReceiptSchema.parse({ ...body, status: event === 'message:read' ? 'READ' : 'DELIVERED' })));
        for (const event of ['typing:start', 'typing:stop'])
            handle(event, async (body) => {
                const id = uuid.parse(body.conversationId);
                if (event === 'typing:start' && Date.now() - lastTyping < 2000)
                    return {};
                lastTyping = Date.now();
                const peer = await messaging.messagingTyping(user.id, user.sessionId, bound(), id);
                if (peer) {
                    const devices = await messaging.messagingRoster(user.id, peer);
                    for (const d of devices)
                        io.to(`e2-device:${d.deviceId}`).emit(event, { conversationId: id, userId: user.id, expiresAt: Date.now() + 5000 });
                }
                return {};
            });
        // Actions are encrypted events on the same authorized send path, never plaintext mutations.
        for (const name of ['reaction:add', 'message:edit', 'message:delete'])
            handle(name, async (body) => messaging.sendMessagingEvent(user.id, user.sessionId, bound(), SendSchema.parse(body)));
    });
}
