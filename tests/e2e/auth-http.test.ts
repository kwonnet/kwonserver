import {moneyJson} from '@/services/walletLedger';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'node:http';
vi.mock('@/routes/v1', () => ({ default: express.Router() }));
vi.mock('@/utils/ipLocation', () => ({ lookup: async () => null }));
import routes from '@/routes/v1/auth';
import prisma from '@/db';
import {decryptEmailToken} from '@/utils/auth-security';
let server: http.Server;
let base: string;
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use(cookieParser()); app.use('/auth', routes);
  server = http.createServer(app); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); await prisma.$disconnect(); });
const post = (route: string, data: any) => fetch(`${base}/auth/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
async function verifyCreated(email: string) {
 const user=await prisma.user.findUniqueOrThrow({where:{email}});
 const action=await prisma.authEmailToken.findFirstOrThrow({where:{userId:user.id,purpose:'VERIFY_EMAIL',usedAt:null}});
 expect((await post('verify-email',{token:decryptEmailToken(action.encryptedToken)})).status).toBe(200);
 return user;
}
it('signs up, signs in, resolves bearer and cookie sessions, and blocks suspended users', async () => {
  const body = { name: 'Test Person', email: 'http-signup@test.invalid', password: 'Test-password-42' };
  const signup = await post('signup', body); expect(signup.status).toBe(202);
  expect(signup.headers.get('set-cookie')).toBeNull();
  expect(await signup.json()).toMatchObject({verificationRequired:true});
  expect((await post('signin', body)).status).toBe(403);
  const created = {user: await verifyCreated(body.email)};
  const stored = await prisma.user.findUniqueOrThrow({ where: { id: created.user.id }, include: { wallet: true } });
  expect(moneyJson(stored.password)).not.toBe(body.password); expect(moneyJson(stored.wallet?.bonus)).toBeGreaterThanOrEqual(10);
  const duplicate = await post('signup', body); expect(duplicate.status).toBe(422);
  const badLogin = await post('signin', { email: body.email, password: 'Wrong-password' }); expect(badLogin.status).toBe(401);
  const login = await post('signin', body); expect(login.status).toBe(200);
  const signedIn: any = await login.json();
  const me = await fetch(`${base}/auth/me`, { headers: { authorization: `Bearer ${signedIn.accessToken}` } });
  expect(me.status).toBe(200); expect(await me.json()).toMatchObject({ id: created.user.id, email: body.email });
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  expect((await fetch(`${base}/auth/me`, { headers: { cookie } })).status).toBe(200);
  await prisma.user.update({ where: { id: created.user.id }, data: { status: 'SUSPENDED' } });
  expect((await fetch(`${base}/auth/me`, { headers: { authorization: `Bearer ${signedIn.accessToken}` } })).status).toBe(401);
});
it('rejects malformed signup without persisting a user', async () => {
  const before = await prisma.user.count(); expect((await post('signup', { email: 'invalid' })).status).toBe(400); expect(await prisma.user.count()).toBe(before);
});

it('exposes owned security history, reuses refresh sessions and rejects revoked bearer replay', async () => {
  const body = {name: 'Security User', email: 'http-security@test.invalid', password: 'Test-password-42'};
  const signup = await post('signup', body); expect(signup.status).toBe(202);await verifyCreated(body.email); const account: any = await (await post('signin',body)).json();
  expect(account.user.sessionId).toEqual(expect.any(String));
  const headers = {authorization: `Bearer ${account.accessToken}`};
  const first = await fetch(`${base}/auth/sessions`, {headers}); expect(first.status).toBe(200);
  const list: any = await first.json(); expect(list.sessions).toHaveLength(1); expect(list.sessions[0]).toMatchObject({id: account.user.sessionId, provider: 'PASSWORD', current: true});
  expect(list.sessions[0]).not.toHaveProperty('ipHash');
  const refreshed = await post('refresh-token', {token: account.accessToken}); expect(refreshed.status).toBe(200);
  const updated: any = await refreshed.json(); expect(updated.user.sessionId).toBe(account.user.sessionId);
  const history = await fetch(`${base}/auth/login-events`, {headers}); const events: any = await history.json(); expect(events.events).toHaveLength(1); expect(events.events[0].kind).toBe('SIGN_IN');
  await post('signup', {...body, email: 'http-security-other@test.invalid'});await verifyCreated('http-security-other@test.invalid'); const foreign: any = await (await post('signin',{...body,email:'http-security-other@test.invalid'})).json();
  expect((await fetch(`${base}/auth/sessions/${foreign.user.sessionId}`, {method: 'DELETE', headers})).status).toBe(404);
  expect((await fetch(`${base}/auth/sessions/${account.user.sessionId}`, {method: 'DELETE', headers})).status).toBe(204);
  expect((await fetch(`${base}/auth/me`, {headers: {authorization: `Bearer ${updated.accessToken}`}})).status).toBe(401);
  expect((await post('refresh-token', {token: updated.accessToken})).status).toBe(401);
  expect(await prisma.loginEvent.count({where: {userId: account.user.id}})).toBe(1);
});
