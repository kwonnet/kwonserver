import {createHash} from 'node:crypto';
import {PrismaPg} from '@prisma/adapter-pg';
import {Worker} from 'bullmq';
import {beforeAll, afterAll, expect, it, vi} from 'vitest';
vi.mock('@/db', async () => {const {PrismaClient} = await import('@prisma/client');
 return {default: new PrismaClient({adapter: new PrismaPg({connectionString: process.env.DATABASE_URL, max: 10})})};});
vi.mock('@/redis', async () => {const {createClient} = await import('redis');
 const client = createClient({url: process.env.REDIS_URL}); await client.connect(); return {default: client};});
import db from '@/db';
import redis from '@/redis';
import {moneyJson, walletOperation} from '@/services/walletLedger';
import {run as weekly} from '@/cron/recurring/reward_top_players_every_week';
import {run as yearly} from '@/cron/recurring/reward_top_players_of_the_year';
import {run as champion} from '@/cron/recurring/reward_champ_of_the_year';
import {run as grandChampion} from '@/cron/recurring/reward_grand_champ_of_the_year';
import {recoverMilestoneRewards, milestoneRewardConfig} from '@/services/walletLedger/milestoneRewardQueue';
import {processMilestoneRewardTask} from '@/services/walletLedger/milestoneRewardJobs';
import {processMilestoneRewardJob} from '@/cron/milestoneRewards';
import {milestoneRewardQueue, notificationQueue, closeJobQueues} from '@/cron/jobs/queue';
import {getRankingRewardKeys, getRewardDateInfo} from '@/utils';
import {getNotificationStreamSnapshot} from '@/services/v1/notifications';
const prefix = 'milestone-reward-';
const ids = Array.from({length: 4}, (_, i) => `${prefix}${i}`);
const keys: string[] = [], operations: string[] = [];
let gameId: string, categories: any[], milestones: string[];
const period = getRewardDateInfo();
beforeAll(async () => {
 await db.user.createMany({data: ids.map(id => ({id, username: id, name: id, email: `${id}@test.invalid`}))});
 await db.wallet.createMany({data: ids.map(userId => ({userId, coins: 0, bonus: 10}))});
 const game = await db.game.create({data: {name: prefix, description: 'Reward queue test', modes: ['SINGLE', 'MULTI'],
  categories: {create: [{name: `${prefix}A`, description: 'test'}, {name: `${prefix}B`, description: 'test'}]}}, include: {categories: true}});
 gameId = game.id; categories = game.categories.map(c => ({...c, game}));
 const created = await db.gameMilestone.createManyAndReturn({data: [
  ...[1,2,3].map(rank => ({name: 'WEEK' as const, milestone: rank, reward: [25,10,5][rank-1], rewardType: 'COINS' as const, reason: 'TOP_OF_THE_WEEK' as const})),
  ...[1,2,3].map(rank => ({name: 'YEAR' as const, milestone: rank, reward: [100,50,20][rank-1], rewardType: rank === 2 ? 'BONUS' as const : 'COINS' as const, reason: 'TOP_OF_THE_YEAR' as const})),
  {name: 'CHAMP', milestone: 1, reward: 200, rewardType: 'COINS', reason: 'CHAMP_OF_THE_YEAR'},
  {name: 'GRAND_CHAMP', milestone: 1, reward: 500, rewardType: 'COINS', reason: 'GRAND_CHAMP_OF_THE_YEAR'},
 ]});
 milestones = created.map(m => m.id);
 for (const c of categories) for (const mode of ['single','multi'] as const) {
  const key = getRankingRewardKeys(c.id, mode).rewardWeek; keys.push(key);
  await redis.zAdd(key, ids.slice(0,3).map((value,i) => ({value, score: 30-i})));
 }
 await db.gameMonthStat.createMany({data: [
  {playerId: ids[0], catId: categories[0].id, year: period.yearlyRewardYear, month: 1, mode: 'MULTI', score: 100},
  {playerId: ids[1], catId: categories[0].id, year: period.yearlyRewardYear, month: 1, mode: 'MULTI', score: 100},
  {playerId: ids[0], catId: categories[1].id, year: period.yearlyRewardYear, month: 2, mode: 'MULTI', score: 200},
  {playerId: ids[2], catId: categories[0].id, year: period.yearlyRewardYear, month: 2, mode: 'SINGLE', score: 5000},
  // A later calendar year must not leak into an old annual task.
  {playerId: ids[3], catId: categories[0].id, year: period.yearlyRewardYear+1, month: 1, mode: 'MULTI', score: 999999},
 ]});
});
afterAll(async () => {
 try {
  if (keys.length) await redis.del(keys);
  const tasks = await db.gameMilestoneRewardTask.findMany({where: {scopeId: {in: [gameId, ...categories.map(c => c.id), 'global']}, year: {in: [period.weeklyRewardYear, period.yearlyRewardYear]}}});
  const receipts = tasks.flatMap(task => {
   const awards = (task.plan as any)?.awards ?? [];
   return [createHash('sha256').update(`game-milestone-batch:${task.id}`).digest('hex'),
    ...awards.map((a: any) => createHash('sha256').update(`${a.legacyScope}:${a.legacyKey}`).digest('hex'))];
  });
  await db.gameMilestoneRewardTask.deleteMany({where: {id: {in: tasks.map(t => t.id)}}});
  await db.walletOperation.deleteMany({where: {id: {in: [...operations,...receipts]}}});
  await db.notification.deleteMany({where: {recipientId: {in: ids}}});
  await db.transaction.deleteMany({where: {userId: {in: ids}}});
  await db.game.delete({where: {id: gameId}});
  await db.user.deleteMany({where: {id: {in: ids}}});
  await db.gameMilestone.deleteMany({where: {id: {in: milestones}}});
 } finally {await closeJobQueues(); await redis.quit(); await db.$disconnect();}
}, 120000);

it('dispatches all four reward kinds without paying in the cron consumer', async () => {
 vi.spyOn(db.gameCategory, 'findMany').mockResolvedValue(categories);
 vi.spyOn(db.game, 'findMany').mockResolvedValue([categories[0].game]);
 await Promise.all([weekly(), yearly(), champion(), grandChampion()]);
 expect(await db.gameMilestoneRewardTask.count()).toBe(11);
 expect(await db.transaction.count({where: {userId: {in: ids}}})).toBe(0);
 expect(moneyJson((await db.wallet.findUniqueOrThrow({where: {userId: ids[0]}})).coins)).toBe(0);
});
it('rolls back a whole failed payout and retries concurrent jobs using frozen winners and amounts', async () => {
 const task = await db.gameMilestoneRewardTask.findFirstOrThrow({where: {kind: 'WEEK', scopeId: categories[0].id, mode: 'MULTI'}});
 await db.wallet.delete({where: {userId: ids[1]}});
 await expect(processMilestoneRewardTask(task.id)).rejects.toThrow('Wallet not found');
 expect(await db.transaction.count({where: {userId: {in: ids}}})).toBe(0);
 expect(await db.notification.count({where: {recipientId: {in: ids}}})).toBe(0);
 const frozen = (await db.gameMilestoneRewardTask.findUniqueOrThrow({where: {id: task.id}})).plan;
 await redis.zAdd(task.rankingKey!, {value: ids[3], score: 99999});
 const milestone = await db.gameMilestone.findFirstOrThrow({where: {name: 'WEEK', milestone: 1}});
 await db.gameMilestone.update({where: {id: milestone.id}, data: {reward: 999}});
 await db.wallet.create({data: {userId: ids[1], coins: 0, bonus: 10}});
 const cache = `user:${ids[0]}:wallet`; keys.push(cache); await redis.set(cache, 'stale');
 const creditScope = 'milestone-concurrent-credit';
 operations.push(createHash('sha256').update(`${creditScope}:${task.id}`).digest('hex'));
 await Promise.all([processMilestoneRewardTask(task.id), processMilestoneRewardTask(task.id), processMilestoneRewardTask(task.id),
  walletOperation(creditScope, task.id, {}, [ids[0]], async tx => {
   await tx.wallet.update({where: {userId: ids[0]}, data: {coins: {increment: 7}}}); return {};
  })]);
 expect(await redis.exists(cache)).toBe(0);
 expect(await db.transaction.count({where: {userId: {in: ids}}})).toBe(3);
 expect(moneyJson((await db.wallet.findUniqueOrThrow({where: {userId: ids[0]}})).coins)).toBe(32);
 expect((await db.gameMilestoneRewardTask.findUniqueOrThrow({where: {id: task.id}}))).toMatchObject({status: 'COMPLETED', processed: 3, cachePending: false, plan: frozen});
 await db.gameMilestone.update({where: {id: milestone.id}, data: {reward: 25}});
});
it('honors old per-player receipts during migration and retries only cache invalidation after commit', async () => {
 const task = await db.gameMilestoneRewardTask.findFirstOrThrow({where: {kind: 'WEEK', scopeId: categories[1].id, mode: 'MULTI'}});
 const scope = 'reward_top_players_every_week', key = `${task.rankingKey}:${ids[0]}`;
 operations.push(createHash('sha256').update(`${scope}:${key}`).digest('hex'));
 await walletOperation(scope, key, {recipient: ids[0]}, [ids[0]], async tx => {
  await tx.wallet.update({where: {userId: ids[0]}, data: {coins: {increment: 25}}});
  return {achievement: {amount: 25}};
 });
 const invalidation = vi.spyOn(redis, 'del').mockRejectedValueOnce(new Error('Cache offline'));
 await expect(processMilestoneRewardTask(task.id)).rejects.toThrow('Cache offline');
 const paid = await db.gameMilestoneRewardTask.findUniqueOrThrow({where: {id: task.id}});
 expect(paid).toMatchObject({status: 'COMPLETED', previouslyPaid: 1, processed: 3, cachePending: true});
 const balance = moneyJson((await db.wallet.findUniqueOrThrow({where: {userId: ids[0]}})).coins);
 invalidation.mockRestore(); await processMilestoneRewardTask(task.id);
 expect(moneyJson((await db.wallet.findUniqueOrThrow({where: {userId: ids[0]}})).coins)).toBe(balance);
 expect(await db.transaction.count({where: {metadata: {path: ['taskId'], equals: task.id}}})).toBe(2);
});
it('recovers lost queue jobs, ranks annual totals deterministically and pays each scope once', async () => {
 await milestoneRewardQueue.obliterate({force: true});
 await db.gameMilestoneRewardTask.updateMany({data: {nextAttemptAt: new Date(0)}});
 await recoverMilestoneRewards();
 const connection = {host: '127.0.0.1', port: 16379};
 let running = 0, peak = 0, failure: Error | undefined;
 await milestoneRewardQueue.setGlobalConcurrency(2);
 const processor = async (job: any) => {
  running++; peak = Math.max(peak,running);
  try {await processMilestoneRewardJob(job);} finally {running--;}
 };
 const workers = [1,2].map(() => new Worker(milestoneRewardQueue.name, processor, {connection, concurrency: 4}));
 for (const w of workers) w.on('failed', (_job,error) => {failure = error;});
 try {
  const deadline = Date.now()+15000;
  while (await db.gameMilestoneRewardTask.count({where: {status: {not: 'COMPLETED'}}})) {
   if (failure) throw failure;
   if (Date.now()>deadline) throw new Error('Milestone queue timeout');
   await new Promise(resolve => setTimeout(resolve,20));
  }
  expect(peak).toBeLessThanOrEqual(2); expect(peak).toBeGreaterThan(1);
 } finally {await Promise.all(workers.map(w => w.close()));}
 const tasks = await db.gameMilestoneRewardTask.findMany();
 const catYear = tasks.find(t => t.kind==='YEAR' && t.scopeId===categories[0].id && t.mode==='MULTI')!;
 expect((catYear.plan as any).awards.map((a: any) => a.playerId)).toEqual([ids[0],ids[1]]);
 expect((catYear.plan as any).awards[1].rewardType).toBe('BONUS');
 expect(Number(catYear.coinsPaid)).toBe(100); expect(Number(catYear.bonusPaid)).toBe(50);
 const champ = tasks.find(t => t.kind==='CHAMP' && t.mode==='MULTI')!;
 expect((champ.plan as any).awards[0].playerId).toBe(ids[0]);
 const grand = tasks.find(t => t.kind==='GRAND_CHAMP')!;
 expect((grand.plan as any).awards[0].playerId).toBe(ids[2]);
 expect((tasks.find(t => t.kind==='YEAR' && t.scopeId===categories[1].id && t.mode==='SINGLE')!.plan as any).awards).toEqual([]);
 const count = await db.transaction.count({where: {userId: {in: ids}}});
 await Promise.all(tasks.flatMap(t => [processMilestoneRewardTask(t.id),processMilestoneRewardTask(t.id)]));
 expect(await db.transaction.count({where: {userId: {in: ids}}})).toBe(count);
 expect(await db.gameAchievement.count({where: {playerId: {in: ids}}})).toBe(count);
 const ledger = await db.transaction.findMany({where: {userId: {in: ids}}});
 const balances = await db.wallet.findMany({where: {userId: {in: ids}}});
 for (const wallet of balances) {
  const coins = ledger.filter(t => t.userId===wallet.userId && t.source==='COINS').reduce((sum,t) => sum+Number(t.amount),0);
  const bonus = ledger.filter(t => t.userId===wallet.userId && t.source==='BONUS').reduce((sum,t) => sum+Number(t.amount),0);
  // Player zero also has the emulated old 25-coin award and unrelated 7-coin credit.
  expect(Number(wallet.coins)).toBe(coins+(wallet.userId===ids[0]?32:0));
  expect(Number(wallet.bonus)).toBe(10+bonus);
 }

 const notifications = await db.notification.findMany({where: {recipientId: {in: ids}}});
 expect(notifications).toHaveLength(count);
 for (const n of notifications) expect((await notificationQueue.getJob(`notification-${n.id}`))?.data).toEqual({notificationId: n.id});
 expect((await getNotificationStreamSnapshot(ids[0])).totalUnseenCount).toBeGreaterThan(0);
}, 30000);
it('rejects malformed queue input and invalid concurrency settings', async () => {
 await expect(processMilestoneRewardJob({name: 'other', data: {taskId: 'a'.repeat(64)}})).rejects.toThrow('Invalid');
 expect(milestoneRewardConfig({})).toEqual({globalConcurrency: 4, localConcurrency: 4});
 expect(() => milestoneRewardConfig({MILESTONE_REWARD_GLOBAL_CONCURRENCY: '0'})).toThrow();
});
