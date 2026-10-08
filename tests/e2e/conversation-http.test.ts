import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
// Authentication, routes, controllers, profile hydration, PostgreSQL and MongoDB
// are real. The unused root route tree is isolated to avoid background workers.
vi.mock('@/routes/v1', () => ({ default: express.Router() }));
import prisma from '@/db';
import routes from '@/routes/v1/conversations';
import { encryptString, jwtSign } from '@/utils';
import { ConversationModel } from '@/db/models';
let server: http.Server;
let base: string;
const token = (id: string) => jwtSign({ data: encryptString(JSON.stringify({ id, emailVerifiedAt: new Date(), name: id }), 'integration-encryption') }, { expiresIn: '5m' });
beforeAll(async () => {
  await prisma.user.createMany({ data: ['http-u', 'http-r', 'outsider'].map(id => ({ id, emailVerifiedAt: new Date(), name: id, username: id, email: `${id}@test.invalid` })) });
  await mongoose.connect('mongodb://127.0.0.1:17017/kwonserver_test');
  const app = express(); app.use(express.json()); app.use(cookieParser()); app.use('/conversations', routes);
  server = http.createServer(app); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); await mongoose.disconnect(); await prisma.$disconnect(); });
it('rejects unauthenticated HTTP requests', async () => {
  expect((await fetch(`${base}/conversations/users/u/conversations?kind=chat`)).status).toBe(401);
});
it('creates a conversation, reads it as a member, and denies another signed-in user', async () => {
  const auth = { authorization: `Bearer ${token('http-u')}`, 'content-type': 'application/json' };
  const response = await fetch(`${base}/conversations`, { method: 'POST', headers: auth, body: JSON.stringify({ senderId: 'http-u', recipientId: 'http-r', kind: 'chat' }) });
  expect(response.status).toBe(201);
  const convo = await ConversationModel.findOne({ 'initiator.id': 'http-u' });
  const own = await fetch(`${base}/conversations/${convo!._id}/messages`, { headers: auth }); expect(own.status).toBe(200);
  expect(await own.json()).toEqual({ messages: [], nextCursor: null });
  const other = await fetch(`${base}/conversations/${convo!._id}/messages`, { headers: { authorization: `Bearer ${token('outsider')}` } }); expect(other.status).toBe(404);
});
