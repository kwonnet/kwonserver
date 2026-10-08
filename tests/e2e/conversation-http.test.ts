import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import cookieParser from 'cookie-parser';
// Authentication, routes, controllers, profile hydration, PostgreSQL
// are real. The unused root route tree is isolated to avoid background workers.
vi.mock('@/routes/v1', () => ({ default: express.Router() }));
import prisma from '@/db';
import routes from '@/routes/v1/conversations';
import { encryptString, jwtSign } from '@/utils';
import { randomUUID } from 'node:crypto';
import { startAuthSession } from '@/services/v1/auth';
import { enrollMessagingDevice } from '@/services/v1/conversations';
const sessions: Record<string, string> = {};
const devices: Record<string, string> = {};
let server: http.Server;
let base: string;
const token = (id: string) => jwtSign({ data: encryptString(JSON.stringify({ id, sessionId: sessions[id], emailVerifiedAt: new Date(), name: id }), 'integration-encryption') }, { expiresIn: '5m' });
beforeAll(async () => {
    await prisma.user.createMany({ data: ['http-u', 'http-r', 'outsider'].map(id => ({ id, sessionId: sessions[id], emailVerifiedAt: new Date(), name: id, username: id, email: `${id}@test.invalid` })) });
    for (const id of ['http-u', 'http-r', 'outsider']) {
        sessions[id] = await startAuthSession(id, 'PASSWORD', { device: { browser: null, browserVersion: null, os: null, osVersion: null, type: 'unknown' }, location: null, ipAddress: null, ipHash: null, metadataSource: 'API_REQUEST' });
        devices[id] = randomUUID();
        await enrollMessagingDevice(id, sessions[id], { deviceId: devices[id], signalDeviceId: 1, registrationId: 1, identityPublic: Buffer.alloc(33, 1).toString('base64'), actionSigningPublic: Buffer.alloc(32, 1).toString('base64'), signedPreKey: { keyId: 1, publicKey: Buffer.alloc(33, 1).toString('base64'), signature: Buffer.alloc(64, 1).toString('base64') }, preKeys: [] });
    }
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/conversations', routes);
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); await prisma.$disconnect(); });
it('rejects unauthenticated HTTP requests', async () => {
    expect((await fetch(`${base}/conversations/users/u/conversations?kind=chat`)).status).toBe(401);
});
it('creates a conversation, reads it as a member, and denies another signed-in user', async () => {
    const auth = { authorization: `Bearer ${token('http-u')}`, 'content-type': 'application/json', 'x-messaging-device': devices['http-u'] };
    const response = await fetch(`${base}/conversations`, { method: 'POST', headers: auth, body: JSON.stringify({ senderId: 'http-u', recipientId: 'http-r', kind: 'chat' }) });
    expect(response.status).toBe(200);
    const convo = await response.json();
    const own = await fetch(`${base}/conversations/${convo.id}/messages`, { headers: auth });
    expect(own.status).toBe(200);
    expect(await own.json()).toMatchObject({ messages: [], nextCursor: "0" });
    const other = await fetch(`${base}/conversations/${convo.id}/messages`, { headers: { authorization: `Bearer ${token('outsider')}`, 'x-messaging-device': devices.outsider } });
    expect(other.status).toBe(404);
});
