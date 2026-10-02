import { afterAll, beforeAll, expect, it, vi } from 'vitest';
// Word-game vocabulary is unrelated to wallet synchronization.
vi.mock('wordlist-english', () => ({ default: { english: [] } }));
import prisma from '@/db';
import redis from '@/redis';
import { syncRedisUserWalletToPrisma, syncPrismaUserWalletToRedis } from '@/services/helper';
let wallet: any;
beforeAll(async () => {
  if (!redis.isReady) await new Promise<void>((resolve, reject) => { redis.once('ready', resolve); redis.once('error', reject); });
  const user = await prisma.user.create({ data: { id: 'wallet-sync', name: 'Wallet', username: 'wallet_sync', email: 'wallet@test.invalid', wallet: { create: { coins: 10, bonus: 2, credit: 5 } } }, include: { wallet: true } });
  wallet = user.wallet;
});
afterAll(async () => { await redis.quit(); await prisma.$disconnect(); });
it('moves cached balances to PostgreSQL and publishes updated balances back', async () => {
  const key = 'user:wallet-sync:wallet';
  await redis.hSet(key, { id: wallet.id, userId: 'wallet-sync', amount: '12.50', bonus: '3.75', credit: '6.00' });
  expect(await syncRedisUserWalletToPrisma('wallet-sync')).toMatchObject({ isError: false });
  const stored = await prisma.wallet.findUniqueOrThrow({ where: { userId: 'wallet-sync' } });
  expect(stored).toMatchObject({ coins: 12.5, bonus: 3.75, credit: 6 });
  const updated = await prisma.wallet.update({ where: { id: wallet.id }, data: { coins: 30, bonus: 4, credit: 20 } });
  expect(await syncPrismaUserWalletToRedis('wallet-sync', updated)).toMatchObject({ isError: false });
  expect(await redis.hGetAll(key)).toMatchObject({ amount: '30.00', bonus: '4.00', credit: '20.00' });
});
it('does not create cache entries when no game wallet is cached', async () => {
  await redis.del('user:wallet-sync:wallet'); await syncPrismaUserWalletToRedis('wallet-sync', wallet);
  expect(await redis.exists('user:wallet-sync:wallet')).toBe(0);
});
