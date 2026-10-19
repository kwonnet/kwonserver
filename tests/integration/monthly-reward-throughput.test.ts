import {writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PrismaPg} from '@prisma/adapter-pg';
import {afterAll, expect, it, vi} from 'vitest';
vi.mock('@/db', async () => {
  const {PrismaClient} = await import('@prisma/client');
  return {default: new PrismaClient({adapter: new PrismaPg({connectionString: process.env.DATABASE_URL, max: 10})})};
});
vi.mock('@/redis', async () => {
  const {createClient} = await import('redis');
  const client = createClient({url: process.env.REDIS_URL}); await client.connect(); return {default: client};
});
vi.mock('@/services/helper', () => ({getRedisHashKey: async () => ({score: 1, numPlayed: 1})}));
import db from '@/db';
import redis from '@/redis';
import {closeJobQueues} from '@/cron/jobs/queue';
import {settleMonthlyRewards as run} from './monthly-reward-harness';
import {run as dispatch} from '@/cron/recurring/reward_top_players_every_month';
import {Worker} from 'bullmq';
import {monthlyRewardQueue} from '@/cron/jobs/queue';
import {processMonthlyRewardJob} from '@/cron/monthlyRewards';
import {getRankingRewardKeys} from '@/utils';
import {walletOperation} from '@/services/walletLedger';
import {monthlyRewardAtRank, MonthlyRewardCurve} from '@/services/walletLedger/monthlyRewards';
import {monthlyRewardCursorId} from '@/services/walletLedger/monthlyRewardSettlement';
const prefix = 'monthly-throughput-';
const keys: string[] = [];
const games: string[] = [];
afterAll(async () => {
  if (keys.length) await redis.del(keys);
  await db.notification.deleteMany({where: {recipientId: {startsWith: prefix}}});
  await db.transaction.deleteMany({where: {userId: {startsWith: prefix}}});
  await db.wallet.deleteMany({where: {userId: {startsWith: prefix}}});
  await db.user.deleteMany({where: {id: {startsWith: prefix}}});
  await db.game.deleteMany({where: {id: {in: games}}});
  await closeJobQueues(); await redis.quit(); await db.$disconnect();
});
async function fixture(label: string, participants: number) {
  const winners = Math.floor(participants * 0.2);
  const ids = Array.from({length: winners}, (_, i) => `${prefix}${label}-${i.toString().padStart(6, '0')}`);
  await db.user.createMany({data: ids.map(id => ({id, name: id, username: id, email: `${id}@test.invalid`}))});
  await db.wallet.createMany({data: ids.map(userId => ({userId, coins: 0, bonus: 10}))});
  const game = await db.game.create({data: {name: label, description: 'Benchmark', modes: ['MULTI'],
    categories: {create: {name: label, description: 'Benchmark'}}}, include: {categories: true}});
  games.push(game.id);
  vi.spyOn(db.gameCategory, 'findMany').mockResolvedValue(game.categories.map(c => ({...c, game})) as any);
  const catId = game.categories[0].id;
  const period = getRankingRewardKeys(catId, 'multi');
  keys.push(period.rewardMonth, `${period.rewardMonth}:settlement:monthly-90-v2`);
  // Only winners need accounts; the remaining leaderboard positions cannot be credited.
  await redis.zAdd(period.rewardMonth, Array.from({length: participants}, (_, i) => ({
    value: ids[i] ?? `${prefix}${label}-nonwinner-${i}`, score: participants - i,
  })));
  await db.transaction.create({data: {userId: ids[0], txnRef: label, amount: participants * 100,
    currency: 'COINS', source: 'COINS', gateway: 'WALLET', type: 'DEBIT', status: 'COMPLETED',
    category: 'GAME_DEDUCTION', description: 'Benchmark spending',
    createdAt: new Date(Date.UTC(period.dateInfo.year, period.dateInfo.month - 1, 15)), metadata: {catId, mode: 'MULTI'}}});
  return {ids, catId, period, category: game.categories[0], game};
}
it('resumes at the committed cursor, rolls back a failed batch, and preserves concurrent wallet changes', async () => {
  const {ids, catId, period} = await fixture('resume', 7500);
  await db.wallet.delete({where: {userId: ids[500]}});
  await expect(run()).rejects.toThrow('Wallet not found');
  const partial = await db.gameMonthRewardStat.findFirstOrThrow({where: {catId}});
  expect(partial.processedParticipants).toBe(500);
  expect((await db.walletOperation.findUniqueOrThrow({where: {id: monthlyRewardCursorId(partial.id)}})).result).toEqual({nextRank: 501});
  expect(await db.transaction.count({where: {category: 'GAME_MONTHLY_REWARD', metadata: {path: ['catId'], equals: catId}}})).toBe(500);
  await db.wallet.create({data: {userId: ids[500], coins: 0, bonus: 10}});
  // Emulate one award committed by the previous single-recipient implementation.
  // Its receipt must be honored even though the batch cursor has not visited it.
  const legacyAmount = monthlyRewardAtRank(partial.payoutPlan as unknown as MonthlyRewardCurve, 701) / 100;
  await walletOperation('monthly-reward', `${catId}:MULTI:${period.dateInfo.year}:${period.dateInfo.month}:${ids[700]}:COINS`,
    {playerId: ids[700], rewardAmount: legacyAmount, policy: 'monthly-90-v2'}, [ids[700]], async tx => {
      const wallet = await tx.wallet.update({where: {userId: ids[700]}, data: {coins: {increment: legacyAmount}}});
      const transaction = await tx.transaction.create({data: {userId: ids[700], walletId: wallet.id,
        amount: legacyAmount, txnRef: 'legacy-resume', currency: 'COINS', source: 'COINS', gateway: 'WALLET',
        type: 'CREDIT', status: 'COMPLETED', category: 'GAME_MONTHLY_REWARD', description: 'Legacy paid award', metadata: {catId}}});
      const notification = await tx.notification.create({data: {recipientId: ids[700], title: 'Reward', message: 'Legacy paid award',
        sourceKey: `monthly-game-reward:${catId}:MULTI:${period.dateInfo.year}:${period.dateInfo.month}:${ids[700]}`}});
      await tx.gameMonthRewardStat.update({where: {id: partial.id}, data: {
        processedParticipants: {increment: 1}, coinsRewardParticipants: {increment: 1},
        coinsShareAmount: {increment: legacyAmount}, pendingAmount: {decrement: legacyAmount},
        unallocatedAmount: {decrement: legacyAmount}, balanceAfterPayout: {decrement: legacyAmount},
        rewardParticipantsScore: {increment: 6800}, coinsParticipantsScore: {increment: 6800},
      }});
      return {auditId: partial.id, transactionId: transaction.id, notificationId: notification.id};
    });
  const ranges = vi.spyOn(redis, 'zRangeWithScores');
  await Promise.all([run(), run(), walletOperation('benchmark-concurrent-credit', catId, {}, [ids[700]], async tx => {
    await tx.wallet.update({where: {userId: ids[700]}, data: {coins: {increment: 7}}}); return {};
  })]);
  const stat = await db.gameMonthRewardStat.findUniqueOrThrow({where: {id: partial.id}});
  expect(stat.processedParticipants).toBe(1500); expect(stat.status).toBe('COMPLETED');
  expect(ranges.mock.calls.filter(c => c[0] === `${period.rewardMonth}:settlement:monthly-90-v2`).every(c => Number(c[1]) >= 500)).toBe(true);
  const payouts = await db.transaction.findMany({where: {category: 'GAME_MONTHLY_REWARD', metadata: {path: ['catId'], equals: catId}}});
  expect(payouts).toHaveLength(1500);
  expect(await db.notification.count({where: {recipientId: {in: ids}}})).toBe(1500);
  const payout = payouts.find(p => p.userId === ids[700])!;
  const wallet = await db.wallet.findUniqueOrThrow({where: {userId: ids[700]}});
  expect(Number(wallet.coins)).toBe(Number(payout.amount) + 7); expect(Number(wallet.bonus)).toBe(10);
}, 120000);

it('measures end-to-end settlement throughput with 5,000 real wallet credits', async () => {
  const {ids, catId} = await fixture('throughput', 25000);
  const started = performance.now(); await dispatch();
  await drainQueuedRewards();
  const elapsedMs = performance.now() - started;
  const stat = await db.gameMonthRewardStat.findFirstOrThrow({where: {catId}});
  expect(stat.processedParticipants).toBe(5000); expect(stat.status).toBe('COMPLETED');
  expect(await db.notification.count({where: {recipientId: {in: ids}}})).toBe(5000);
  expect(await db.transaction.count({where: {category: 'GAME_MONTHLY_REWARD', metadata: {path: ['catId'], equals: catId}}})).toBe(5000);
  const measurement = {participants: 25000, winners: 5000,
    batchSize: 500, databasePool: 10, concurrentCategories: 1, queueGlobalConcurrency: 4, elapsedMs: Math.round(elapsedMs),
    creditsPerSecond: Math.floor(5000 * 1000 / elapsedMs),
    includes: 'plan, Redis ranking, wallet/ledger/receipt/inbox/audit writes, push queue submission; excludes device delivery and fixture setup'};
  writeFileSync(join(tmpdir(), 'kwon-monthly-reward-benchmark.json'), JSON.stringify(measurement, null, 2));
  process.stdout.write(`MONTHLY_REWARD_BENCHMARK ${JSON.stringify(measurement)}\n`);
}, 120000);

async function drainQueuedRewards() {
  await monthlyRewardQueue.setGlobalConcurrency(4);
  const worker = new Worker(monthlyRewardQueue.name, processMonthlyRewardJob,
    {connection: {host: '127.0.0.1', port: 16379}, concurrency: 4});
  try {
    const deadline = Date.now() + 110000;
    while (await db.monthlyRewardSettlement.count({where: {status: {not: 'COMPLETED'}}})) {
      const failed = await db.monthlyRewardSettlement.findFirst({where: {status: 'FAILED'}});
      if (failed) throw new Error(failed.lastError ?? 'Reward job failed');
      if (Date.now() > deadline) throw new Error('Reward queue did not drain');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  } finally { await worker.close(); }
}

it('benchmarks four concurrent categories using real queued workers', async () => {
  const fixtures = [];
  for (let i = 0; i < 4; i++) fixtures.push(await fixture(`parallel-${i}`, 25000));
  vi.spyOn(db.gameCategory, 'findMany').mockResolvedValue(fixtures.map(f => ({...f.category, game: f.game})) as any);
  const started = performance.now(); await dispatch(); await drainQueuedRewards();
  const elapsedMs = performance.now() - started;
  const rows = await db.gameMonthRewardStat.findMany({where: {catId: {in: fixtures.map(f => f.catId)}}});
  expect(rows).toHaveLength(4); expect(rows.every(r => r.status === 'COMPLETED' && r.processedParticipants === 5000)).toBe(true);
  const measurement = {categories: 4, participants: 100000, winners: 20000, batchSize: 500,
    databasePool: 10, queueGlobalConcurrency: 4, elapsedMs: Math.round(elapsedMs),
    creditsPerSecond: Math.floor(20000 * 1000 / elapsedMs),
    includes: 'durable dispatch, real BullMQ workers, funding, payment/inbox/audit/outbox writes and batch notification queue pointers; excludes provider delivery'};
  writeFileSync(join(tmpdir(), 'kwon-monthly-reward-parallel-benchmark.json'), JSON.stringify(measurement, null, 2));
  process.stdout.write(`MONTHLY_REWARD_PARALLEL_BENCHMARK ${JSON.stringify(measurement)}\n`);
}, 120000);
