import {moneyJson} from '@/services/walletLedger';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'node:http';
vi.mock('@/routes/v1', () => ({ default: express.Router() }));
vi.mock('wordlist-english', () => ({ default: { english: [] } }));
vi.mock('@/services/v1/games', () => ({ getRedisHashKey: vi.fn() }));
import prisma from '@/db';
import redis from '@/redis';
import routes from '@/routes/v1/wallets';
import { generateToken } from '@/utils';
let server: http.Server;
let base: string;
let sender: any;
let recipient: any;
let admin: any;
beforeAll(async () => {
  if (!redis.isReady) await new Promise<void>((resolve, reject) => { redis.once('ready', resolve); redis.once('error', reject); });
  const create = (id: string, role: 'USER' | 'ADMIN', coins: number) => prisma.user.create({ data: { id, role, name: id, username: id, email: `${id}@test.invalid`, wallet: { create: { coins } } } });
  sender = await create('http-sender', 'USER', 500); recipient = await create('http-recipient', 'USER', 0); admin = await create('http-admin', 'ADMIN', 0);
  const app = express(); app.use(express.json()); app.use(cookieParser()); app.use('/wallets', routes);
  server = http.createServer(app); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); await redis.quit(); await prisma.$disconnect(); });
const post = (route: string, actor: any, body: any, key: string = crypto.randomUUID()) => fetch(`${base}/wallets/${route}`, { method: 'POST', headers: { authorization: `Bearer ${generateToken({ id: actor.id, name: actor.name, role: actor.role }, { expiresIn: '5m' })}`, 'content-type': 'application/json', ...(key ? {'Idempotency-Key':key} : {}) }, body: JSON.stringify(body) });
it('forbids minting coins by regular users but allows administrator funding', async () => {
  const data = { userId: recipient.id, amount: 20, bonus: 5 };
  expect((await post('fund', sender, data)).status).toBe(403);
  expect(moneyJson((await prisma.wallet.findUniqueOrThrow({ where: { userId: recipient.id } })).coins)).toBe(0);
  expect((await post('fund', admin, data)).status).toBe(200);
  expect(moneyJson(await prisma.wallet.findUniqueOrThrow({ where: { userId: recipient.id } }))).toMatchObject({ coins: 20, bonus: 5 });
});
it('charges the authenticated sender, not a forged body sender, and persists ledger entries', async () => {
  expect((await post('transfer', sender, { senderId: admin.id, recipientId: recipient.id, amount: 100 })).status).toBe(200);
  expect(moneyJson(await prisma.wallet.findUniqueOrThrow({ where: { userId: sender.id } }))).toMatchObject({ coins: 350, isLocked: false });
  expect(moneyJson(await prisma.wallet.findUniqueOrThrow({ where: { userId: admin.id } }))).toMatchObject({ coins: 0 });
  expect(moneyJson(await prisma.wallet.findUniqueOrThrow({ where: { userId: recipient.id } }))).toMatchObject({ coins: 120, isLocked: false });
  expect(await prisma.transaction.count({ where: { senderId: sender.id } })).toBeGreaterThanOrEqual(2);
});
it('rejects transfers that cannot cover the fee without modifying balances', async () => {
  expect((await post('transfer', sender, { recipientId: recipient.id, amount: 300 })).status).toBe(400);
  expect(moneyJson((await prisma.wallet.findUniqueOrThrow({ where: { userId: sender.id } })).coins)).toBe(350);
});

it('replays concurrent HTTP retries once and refuses to reuse their key for another amount',async()=>{
 const body={recipientId:recipient.id,amount:100};
 const responses=await Promise.all(Array.from({length:5},()=>post('transfer',sender,body,'http-transfer-retry')));
 expect(responses.map(r=>r.status)).toEqual([200,200,200,200,200]);
 expect(moneyJson((await prisma.wallet.findUniqueOrThrow({where:{userId:sender.id}})).coins)).toBe(200);
 expect((await post('transfer',sender,{...body,amount:110},'http-transfer-retry')).status).toBe(409);
 expect(moneyJson((await prisma.wallet.findUniqueOrThrow({where:{userId:sender.id}})).coins)).toBe(200);
});

it('rejects missing idempotency headers without changing the wallet',async()=>{
 const before=await prisma.wallet.findUniqueOrThrow({where:{userId:sender.id}});
 const response=await post('transfer',sender,{recipientId:recipient.id,amount:100},'');
 expect(response.status).toBe(400);
 expect(await response.text()).toContain('Idempotency-Key is required');
 expect((await prisma.wallet.findUniqueOrThrow({where:{userId:sender.id}})).coins.equals(before.coins)).toBe(true);
});
