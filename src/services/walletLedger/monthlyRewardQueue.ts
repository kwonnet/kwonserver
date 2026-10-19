import {createHash} from 'node:crypto';
import {Queue} from 'bullmq';
import {PromisePool} from '@supercharge/promise-pool';
import prisma from '@/db';
import {getRankingRewardKeys} from '@/utils';
import {monthlyRewardCursorId} from './monthlyRewardSettlement';
import logger from '@/logger';

export function monthlyRewardConfig(env: NodeJS.ProcessEnv = process.env) {
  const read = (name: string, fallback: number, max: number) => {
    const value = Number(env[name] ?? fallback);
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`${name} must be an integer from 1 to ${max}`);
    return value;
  };
  return {globalConcurrency: read('MONTHLY_REWARD_GLOBAL_CONCURRENCY', 4, 64),
    localConcurrency: read('MONTHLY_REWARD_LOCAL_CONCURRENCY', 4, 16),
    notificationConcurrency: read('MONTHLY_REWARD_NOTIFICATION_CONCURRENCY', 1, 4)};
}

// Job IDs deduplicate queue entries, but database receipts are the payment authority.
async function ensureJob(queue: Queue, name: string, jobId: string, data: Record<string, unknown>) {
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'failed') {
      try { await existing.retry(); }
      catch (error) {
        logger.warn({event: 'monthly_reward_job_retry_race', jobId, error}, 'Monthly reward job retry raced with another dispatcher');
        if (await existing.getState() === 'failed') throw error;
      }
      return;
    }
    if (state !== 'completed') return;
    try { await existing.remove(); }
    catch (error) {
      logger.warn({event: 'monthly_reward_job_remove_race', jobId, error}, 'Monthly reward job removal raced with another dispatcher');
      if (await queue.getJob(jobId)) throw error;
    }
  }
  await queue.add(name, data, {jobId, attempts: 5, backoff: {type: 'exponential', delay: 5000},
    removeOnComplete: {age: 86400, count: 2000}, removeOnFail: {age: 604800, count: 2000}});
}

export async function enqueueMonthlyRewardTask(settlementId: string) {
  const task = await prisma.monthlyRewardSettlement.findUnique({where: {id: settlementId}});
  if (!task || task.status === 'COMPLETED') return;
  const cursor = await prisma.walletOperation.findUnique({where: {id: monthlyRewardCursorId(task.id)}});
  const nextRank = (cursor?.result as {nextRank?: number})?.nextRank ?? 1;
  if (!Number.isSafeInteger(nextRank) || nextRank < 1) throw new Error('Invalid monthly reward cursor');
  const {monthlyRewardQueue} = await import('@/cron/jobs/queue');
  await ensureJob(monthlyRewardQueue, 'monthly-reward-step', `monthly-reward-${task.id}-${nextRank}`, {settlementId: task.id});
  await prisma.monthlyRewardSettlement.updateMany({where: {id: task.id, status: {not: 'COMPLETED'}},
    data: {nextAttemptAt: new Date(Date.now() + 60000)}});
}

export async function enqueueMonthlyRewardDelivery(batchId: string) {
  const delivery = await prisma.monthlyRewardDelivery.findUnique({where: {id: batchId}});
  if (!delivery || delivery.status === 'COMPLETED') return;
  try {
    const {monthlyRewardNotificationQueue: notificationQueue} = await import('@/cron/jobs/queue');
    if (await notificationQueue.isPaused()) return;
    // Bound pending notification jobs; the database outbox holds the remaining work.
    const counts = await notificationQueue.getJobCounts('waiting', 'active', 'delayed');
    if (Object.values(counts).reduce((sum, count) => sum + count, 0) >= 1000) return;
    await ensureJob(notificationQueue, 'monthly-reward-notifications', `monthly-reward-notifications-${batchId}`, {batchId});
    await prisma.monthlyRewardDelivery.updateMany({where: {id: batchId, status: 'PENDING'},
      data: {nextAttemptAt: new Date(Date.now() + 60000)}});
  } catch (error) {
    // Wallet commit remains valid. The durable outbox and watchdog retry enqueueing.
    logger.error({event: 'monthly_reward_notification_deferred', batchId, error}, 'Monthly reward notification enqueue deferred');
  }
}

async function enqueueAll(ids: string[], enqueue: (id: string) => Promise<void>) {
  const {errors} = await PromisePool.for(ids).withConcurrency(8).process(async id => { await enqueue(id); });
  if (errors.length) throw new Error(`Monthly reward dispatch failed: ${errors.map(e => e.message).join('; ')}`);
}

export async function dispatchMonthlyRewards() {
  const categories = await prisma.gameCategory.findMany({include: {game: true}});
  if (!categories.length) throw new Error('No game categories available');
  const tasks = categories.flatMap(category => category.game.modes.map(mode => {
    const {dateInfo} = getRankingRewardKeys(category.id, mode === 'SINGLE' ? 'single' : 'multi');
    const period = `${category.id}:${mode}:${dateInfo.year}:${dateInfo.month}`;
    return {id: createHash('sha256').update(`monthly-reward-plan:${period}`).digest('hex'),
      catId: category.id, mode, ...dateInfo};
  }));
  await prisma.monthlyRewardSettlement.createMany({data: tasks, skipDuplicates: true});
  await enqueueAll(tasks.map(t => t.id), enqueueMonthlyRewardTask);
  return {dispatched: tasks.length};
}

/** Recover queue loss, an interrupted handoff, exhausted retries, and older months. */
export async function recoverMonthlyRewards() {
  const now = new Date();
  const tasks = await prisma.monthlyRewardSettlement.findMany({where: {
    status: {in: ['PENDING', 'PROCESSING', 'FAILED']}, nextAttemptAt: {lte: now},
  }, orderBy: [{nextAttemptAt: 'asc'}, {id: 'asc'}], take: 1000, select: {id: true}});
  await enqueueAll(tasks.map(t => t.id), enqueueMonthlyRewardTask);
  const deliveries = await prisma.monthlyRewardDelivery.findMany({where: {status: 'PENDING', nextAttemptAt: {lte: now}},
    orderBy: [{nextAttemptAt: 'asc'}, {id: 'asc'}], take: 1000, select: {id: true}});
  await enqueueAll(deliveries.map(d => d.id), enqueueMonthlyRewardDelivery);
}
