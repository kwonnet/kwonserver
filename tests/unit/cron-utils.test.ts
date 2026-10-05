import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { resetMocks } from './fixtures';
const deps = vi.hoisted(() => {
  const queue = () => ({ add: vi.fn(), remove: vi.fn(), getJob: vi.fn() });
  return { queues: { appSubscriptionQueue: queue(), appSubReminderQueue: queue(), postEmbeddingQueue: queue(), postTopicQueue: queue() },
    redis: { get: vi.fn(), set: vi.fn() }, db: { subscription: { findUnique: vi.fn() } }, delay: vi.fn() };
});
vi.mock('@/db', () => ({ default: deps.db }));
vi.mock('@/redis', () => ({ default: deps.redis }));
vi.mock('@/cron/jobs/queue', () => deps.queues);
vi.mock('@/utils/helpers', () => ({ delayExecution: deps.delay }));
import * as jobs from '@/cron/utils';
import logger from '@/logger';
const sub = { id: 'subscription-1234567890', userId: 'user-0987654321', createdAt: new Date('2026-09-01T00:00:00Z'), endDate: new Date('2026-10-03T00:00:00Z') };
const jobId = '0987654321-1234567890';
beforeEach(() => { resetMocks(deps); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T00:00:00Z')); });
afterEach(() => vi.useRealTimers());
it.each([null, '2026-09-01T00:00:00.000Z'])('reads the scheduling watermark %s', async value => {
  deps.redis.get.mockResolvedValue(value);
  expect(await jobs.getLastScheduledJob()).toEqual(value ? new Date(value) : null);
  expect(deps.redis.get).toHaveBeenCalledWith('appSubLastScheduledJob');
});
it('stores an ISO scheduling watermark', async () => {
  await jobs.updateLastScheduledJob(sub.createdAt);
  expect(deps.redis.set).toHaveBeenCalledWith('appSubLastScheduledJob', sub.createdAt.toISOString());
});
it.each([true, false])('deduplicates subscription periods without removing active jobs; watermark=%s', async watermark => {
  await jobs.insertSubscriptionJob(sub, watermark);
  const q = deps.queues;
  const jobId = `subscription-${sub.id}-${sub.endDate.getTime()}`;
  for (const queue of [q.appSubscriptionQueue, q.appSubReminderQueue]) {
    expect(queue.remove).not.toHaveBeenCalled();
  }
  expect(q.appSubscriptionQueue.add).toHaveBeenCalledWith(`sub-${sub.id}`, { subscriptionId: sub.id }, {
    delay: 172800000, attempts: 2, jobId, backoff: { type: 'fixed', delay: 86400000 }, removeOnComplete: true, removeOnFail: { age: 86400 },
  });
  expect(q.appSubReminderQueue.add).toHaveBeenCalledWith(`reminder-${sub.id}`, { subscriptionId: sub.id }, {
    delay: 86400000, jobId, removeOnComplete: { age: 366 * 24 * 3600 }, removeOnFail: { age: 86400 },
  });
  expect(deps.redis.set).toHaveBeenCalledTimes(watermark ? 1 : 0);
});
it('does not advance the watermark after a reminder enqueue failure', async () => {
  deps.queues.appSubReminderQueue.add.mockRejectedValue(new Error('redis unavailable'));
  await expect(jobs.insertSubscriptionJob(sub)).rejects.toThrow('redis unavailable'); expect(deps.redis.set).not.toHaveBeenCalled(); expect(logger.error).toHaveBeenCalled();
});
it('loads only active recurring subscriptions before scheduling', async () => {
  deps.db.subscription.findUnique.mockResolvedValue(sub); await jobs.addSubscriptionCronJob(sub.id);
  expect(deps.db.subscription.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: sub.id, isRecurring: true, status: 'ACTIVE' } }));
  expect(deps.queues.appSubscriptionQueue.add).toHaveBeenCalled();
});
it('skips a missing subscription', async () => {
  deps.db.subscription.findUnique.mockResolvedValue(null); await jobs.addSubscriptionCronJob(sub.id);
  expect(deps.queues.appSubscriptionQueue.add).not.toHaveBeenCalled();
});
it('reports a subscription lookup failure', async () => {
  deps.db.subscription.findUnique.mockRejectedValue(new Error('db')); await jobs.addSubscriptionCronJob(sub.id);
  expect(logger.error).toHaveBeenCalled(); expect(deps.queues.appSubscriptionQueue.add).not.toHaveBeenCalled();
});
it('removes both renewal and reminder jobs', async () => {
  await jobs.removeSubscriptionCronJob({ userId: sub.userId, subId: sub.id });
  expect(deps.queues.appSubscriptionQueue.remove).toHaveBeenCalledWith(jobId, { removeChildren: true });
  expect(deps.queues.appSubReminderQueue.remove).toHaveBeenCalledWith(jobId, { removeChildren: true });
});
it('reports failed subscription job removal', async () => {
  deps.queues.appSubscriptionQueue.remove.mockRejectedValue(new Error('redis')); await jobs.removeSubscriptionCronJob({ userId: sub.userId, subId: sub.id });
  expect(logger.error).toHaveBeenCalled();
});
for (const entry of [
  { prefix: 'emb', queue: deps.queues.postEmbeddingQueue, other: deps.queues.postTopicQueue, add: jobs.addPostEmbeddingCronJob, remove: jobs.removePostEmbeddingCronJob },
  { prefix: 'topic', queue: deps.queues.postTopicQueue, other: deps.queues.postEmbeddingQueue, add: jobs.addPostTopicCronJob, remove: jobs.removePostTopicCronJob },
]) {
  it(`schedules ${entry.prefix} jobs with retry and retention settings`, async () => {
    await entry.add('post');
    expect(entry.queue.remove).toHaveBeenCalledWith('post', { removeChildren: true });
    expect(entry.queue.add).toHaveBeenCalledWith(`${entry.prefix}-post`, { id: 'post' }, {
      delay: 60000, attempts: 2, jobId: 'post', backoff: { type: 'fixed', delay: 300000 }, removeOnComplete: true, removeOnFail: { age: 86400 },
    });
    expect(entry.other.add).not.toHaveBeenCalled();
  });
  it(`reports ${entry.prefix} scheduling failures`, async () => {
    entry.queue.add.mockRejectedValue(new Error('redis')); await entry.add('post'); expect(logger.error).toHaveBeenCalled();
  });
  it(`removes ${entry.prefix} jobs from the correct queue`, async () => {
    await entry.remove('post'); expect(entry.queue.remove).toHaveBeenCalledWith('post', { removeChildren: true }); expect(entry.other.remove).not.toHaveBeenCalled();
  });
  it(`reports ${entry.prefix} removal failures`, async () => {
    entry.queue.remove.mockRejectedValue(new Error('redis')); await entry.remove('post'); expect(logger.error).toHaveBeenCalled();
  });
}

it('deduplicates versioned topic jobs without removing active work and bounds retries', async () => {
  await jobs.enqueuePostTopic('post', 'first'); await jobs.enqueuePostTopic('post', 'edited');
  const queue = deps.queues.postTopicQueue;
  expect(queue.remove).not.toHaveBeenCalled();
  expect(queue.add.mock.calls[0][2]).toMatchObject({ attempts: 4, priority: 1, backoff: { type: 'exponential', delay: 30000 } });
  expect(queue.add.mock.calls[0][2].jobId).not.toBe(queue.add.mock.calls[1][2].jobId);
  expect(queue.add.mock.calls[0][1]).toEqual({ id: 'post', contentHash: expect.any(String) });
});
it('retries exhausted topic jobs only after the cooldown', async () => {
  const retry = vi.fn();
  deps.queues.postTopicQueue.getJob.mockResolvedValue({ getState: async () => 'failed', finishedOn: Date.now(), retry });
  await jobs.enqueuePostTopic('post', 'text'); expect(retry).not.toHaveBeenCalled();
  vi.advanceTimersByTime(3600000); await jobs.enqueuePostTopic('post', 'text'); expect(retry).toHaveBeenCalledOnce();
  expect(deps.queues.postTopicQueue.add).not.toHaveBeenCalled();
});

it('preserves active topic jobs and supports empty content and backfill priority', async () => {
  deps.queues.postTopicQueue.getJob.mockResolvedValueOnce({ getState: async () => 'active' });
  await jobs.enqueuePostTopic('post', 'text'); expect(deps.queues.postTopicQueue.add).not.toHaveBeenCalled();
  deps.queues.postTopicQueue.getJob.mockResolvedValueOnce(undefined);
  await jobs.enqueuePostTopic('empty', null, 10);
  expect(deps.queues.postTopicQueue.add.mock.calls[0][2].priority).toBe(10);
});
it('recovers retained failures without a completion timestamp', async () => {
  const retry = vi.fn();
  deps.queues.postTopicQueue.getJob.mockResolvedValue({ getState: async () => 'failed', retry });
  await jobs.enqueuePostTopic('post', 'text'); expect(retry).toHaveBeenCalledOnce();
});
