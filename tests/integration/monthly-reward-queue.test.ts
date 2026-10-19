import {createHash} from 'node:crypto';
import {PrismaPg} from '@prisma/adapter-pg';
import {Worker} from 'bullmq';
import {afterAll, beforeAll, expect, it, vi} from 'vitest';
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
import {run as dispatch} from '@/cron/recurring/reward_top_players_every_month';
import {processMonthlyRewardJob, processMonthlyRewardNotificationJob} from '@/cron/monthlyRewards';
import {enqueueMonthlyRewardTask, recoverMonthlyRewards} from '@/services/walletLedger/monthlyRewardQueue';
import {processMonthlyRewardStep} from '@/services/walletLedger/monthlyRewardJobs';
import {getMonthlyRewardProgress} from '@/services/walletLedger/monthlyRewardProgress';
import {monthlyRewardQueue, monthlyRewardNotificationQueue, closeJobQueues} from '@/cron/jobs/queue';
import {getRankingRewardKeys} from '@/utils';
import {monthlyRewardCursorId} from '@/services/walletLedger/monthlyRewardSettlement';
const prefix = 'monthly-queue-';
const ids = Array.from({length: 2500}, (_, i) => `${prefix}${i}`);
const keys: string[] = [];
let gameId: string, bigId: string;
let categories: any[];
const sequence: string[] = [];
beforeAll(async () => {
  await db.user.createMany({data: ids.map(id => ({id, username: id, name: id, email: `${id}@test.invalid`}))});
  await db.wallet.createMany({data: ids.map(userId => ({userId}))});
  const game = await db.game.create({data: {name: '600 queued categories', description: 'Queue test', modes: ['MULTI']}});
  gameId = game.id;
  const rows = await db.gameCategory.createManyAndReturn({data: Array.from({length: 601}, (_, i) => ({gameId,
    name: `${prefix}category-${i}`, description: 'Queue test'}))});
  bigId = rows[0].id;
  categories = rows.map(c => ({...c, game}));
  const pipeline = redis.multi();
  for (const c of rows) {
    const period = getRankingRewardKeys(c.id, 'multi');
    keys.push(period.rewardMonth, `${period.rewardMonth}:settlement:monthly-90-v2`);
    const count = c.id === bigId ? 12500 : 5;
    pipeline.zAdd(period.rewardMonth, Array.from({length: count}, (_, i) => ({value: ids[i] ?? `${prefix}nonwinner-${i}`, score: count - i})));
  }
  await pipeline.exec();
  const period = getRankingRewardKeys(bigId, 'multi').dateInfo;
  await db.transaction.createMany({data: rows.map(c => ({userId: ids[0], txnRef: c.id, amount: 40,
    currency: 'COINS', source: 'COINS', gateway: 'WALLET', type: 'DEBIT', status: 'COMPLETED',
    category: 'GAME_DEDUCTION', description: 'Queue funding', metadata: {catId: c.id, mode: 'MULTI'},
    createdAt: new Date(Date.UTC(period.year, period.month - 1, 15))}))});
}, 90000);
// Bulk fixtures exercise real FK cascades; account deletion can exceed the
// default 30-second hook budget on CI. Keep cleanup awaited before the next file.
afterAll(async () => {
  try {
    if (keys.length) await redis.del(keys);
    await db.notification.deleteMany({where: {recipientId: {in: ids}}});
    await db.transaction.deleteMany({where: {userId: {in: ids}}});
    await db.wallet.deleteMany({where: {userId: {in: ids}}});
    await db.user.deleteMany({where: {id: {in: ids}}});
    await db.game.delete({where: {id: gameId}});
  } finally {
    try { await closeJobQueues(); }
    finally {
      try { await redis.quit(); }
      finally { await db.$disconnect(); }
    }
  }
}, 120000);
async function drain(expectParallel = true) {
  await monthlyRewardQueue.setGlobalConcurrency(2);
  let running = 0, maximum = 0;
  const processor = async (job: any) => {
    running++; maximum = Math.max(maximum, running); sequence.push(job.data.settlementId);
    try { await processMonthlyRewardJob(job); } finally { running--; }
  };
  let failedError: Error | undefined;
  const workers = [1, 2].map(() => new Worker(monthlyRewardQueue.name, processor,
    {connection: {host: '127.0.0.1', port: 16379}, concurrency: 3}));
  for (const worker of workers) worker.on('failed', (_job, error) => { failedError = error; });
  try {
    const deadline = Date.now() + 170000;
    while (await db.monthlyRewardSettlement.count({where: {status: {not: 'COMPLETED'}}})) {
      if (failedError) throw failedError;
      if (Date.now() > deadline) throw new Error('Settlement queue timed out');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    expect(maximum).toBeLessThanOrEqual(2); if (expectParallel) expect(maximum).toBeGreaterThan(1);
  } finally { await Promise.all(workers.map(w => w.close())); }
}
it('registers 601 durable category tasks without crediting wallets in the cron consumer', async () => {
  vi.spyOn(db.gameCategory, 'findMany').mockResolvedValue(categories);
  await dispatch();
  expect(await db.monthlyRewardSettlement.count({where: {catId: {in: categories.map(c => c.id)}}})).toBe(601);
  expect(await db.gameMonthRewardStat.count({where: {catId: {in: categories.map(c => c.id)}}})).toBe(0);
  const progress = await getMonthlyRewardProgress(getRankingRewardKeys(bigId, 'multi').dateInfo, true);
  expect(progress[0]).toMatchObject({settlements: 601, unplanned: 601, processed: 0, estimatedRemainingSeconds: null});
}, 30000);
it('recovers lost Redis jobs, honors a global cap across replicas, and rotates large categories fairly', async () => {
  await monthlyRewardQueue.obliterate({force: true});
  // Simulate the next watchdog tick; recently queued tasks have a one-minute grace.
  await db.monthlyRewardSettlement.updateMany({where: {status: {not: 'COMPLETED'}}, data: {nextAttemptAt: new Date(0)}});
  await recoverMonthlyRewards();
  await drain();
  const tasks = await db.monthlyRewardSettlement.findMany({where: {catId: {in: categories.map(c => c.id)}}});
  expect(tasks.every(t => t.status === 'COMPLETED')).toBe(true);
  const bigTask = tasks.find(t => t.catId === bigId)!;
  const bigPositions = sequence.flatMap((id, i) => id === bigTask.id ? [i] : []);
  expect(bigPositions).toHaveLength(5);
  expect(bigPositions[1] - bigPositions[0]).toBeGreaterThan(1);
  const small = await db.gameMonthRewardStat.findMany({where: {catId: {in: categories.slice(1).map(c => c.id)}}});
  expect(small).toHaveLength(600); expect(small.every(s => s.processedParticipants === 1 && Number(s.coinsShareAmount) === 10)).toBe(true);
}, 180000);
it('recovers a commit-to-queue handoff failure using the original month after rollover', async () => {
  const cat = await db.gameCategory.create({data: {gameId, name: 'Old period recovery', description: 'Queue test'}});
  const current = getRankingRewardKeys(cat.id, 'multi').dateInfo;
  const before = new Date(Date.UTC(current.year, current.month - 2, 15));
  const period = {year: before.getUTCFullYear(), month: before.getUTCMonth() + 1};
  const ranking = getRankingRewardKeys(cat.id, 'multi', period);
  keys.push(ranking.rewardMonth, `${ranking.rewardMonth}:settlement:monthly-90-v2`);
  await redis.zAdd(ranking.rewardMonth, Array.from({length: 7500}, (_, i) => ({value: ids[i] ?? `${prefix}old-nonwinner-${i}`, score: 7500 - i})));
  await db.transaction.create({data: {userId: ids[0], txnRef: 'old-period-funding', amount: 10000,
    currency: 'COINS', source: 'COINS', gateway: 'WALLET', type: 'DEBIT', status: 'COMPLETED',
    category: 'GAME_DEDUCTION', description: 'Old period funding', createdAt: before, metadata: {catId: cat.id, mode: 'MULTI'}}});
  const id = createHash('sha256').update(`monthly-reward-plan:${cat.id}:MULTI:${period.year}:${period.month}`).digest('hex');
  await db.monthlyRewardSettlement.create({data: {id, catId: cat.id, mode: 'MULTI', ...period}});
  vi.spyOn(monthlyRewardQueue, 'add').mockRejectedValueOnce(new Error('Queue handoff unavailable'));
  await expect(processMonthlyRewardStep(id)).rejects.toThrow('Queue handoff unavailable');
  expect((await db.walletOperation.findUniqueOrThrow({where: {id: monthlyRewardCursorId(id)}})).result).toEqual({nextRank: 501});
  await db.monthlyRewardSettlement.update({where: {id}, data: {nextAttemptAt: new Date(0)}});
  await recoverMonthlyRewards(); await drain(false);
  const audit = await db.gameMonthRewardStat.findUniqueOrThrow({where: {id}});
  expect(audit).toMatchObject({...period, status: 'COMPLETED', processedParticipants: 1500});
  expect(await db.transaction.count({where: {category: 'GAME_MONTHLY_REWARD', metadata: {path: ['auditId'], equals: id}}})).toBe(1500);
}, 180000);
it('recovers notification queue loss with small batch pointers and bulk processes unsubscribed recipients', async () => {
  await monthlyRewardNotificationQueue.obliterate({force: true});
  await db.monthlyRewardDelivery.updateMany({data: {nextAttemptAt: new Date(0)}});
  await recoverMonthlyRewards();
  const waiting = await monthlyRewardNotificationQueue.getWaiting(0, 0);
  expect(Object.keys(waiting[0].data)).toEqual(['batchId']);
  const worker = new Worker(monthlyRewardNotificationQueue.name, processMonthlyRewardNotificationJob,
    {connection: {host: '127.0.0.1', port: 16379}, concurrency: 2});
  try {
    const deadline = Date.now() + 60000;
    while (await db.monthlyRewardDelivery.count({where: {status: 'PENDING'}})) {
      if (Date.now() > deadline) throw new Error('Notification batches did not drain');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    expect(await db.notification.count({where: {recipientId: {in: ids}, pushSentAt: null}})).toBe(0);
    const progress = await getMonthlyRewardProgress(getRankingRewardKeys(bigId, 'multi').dateInfo, true);
    expect(progress[0]).toMatchObject({settlements: 601, completed: 601, failed: 0, unplanned: 0,
      qualifying: 3100, processed: 3100, notificationBatchesPending: 0, estimatedRemainingSeconds: 0});
    const financialOnly = await getMonthlyRewardProgress(getRankingRewardKeys(bigId, 'multi').dateInfo);
    expect(financialOnly[0]).toMatchObject({processed: 3100, notificationBatchesPending: null, notificationBatchesCompleted: null, estimatedRemainingSeconds: 0});
  } finally { await worker.close(); }
}, 90000);
