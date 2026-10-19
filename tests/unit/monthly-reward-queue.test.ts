import {beforeEach, expect, it, vi} from 'vitest';
const mocks = vi.hoisted(() => ({
  categories: vi.fn(), create: vi.fn(), task: vi.fn(), tasks: vi.fn(), cursor: vi.fn(), deliveries: vi.fn(),
  delivery: vi.fn(), updateDelivery: vi.fn(), getJob: vi.fn(), add: vi.fn(), counts: vi.fn(),
}));
vi.mock('@/db', () => ({default: {
  gameCategory: {findMany: mocks.categories}, walletOperation: {findUnique: mocks.cursor},
  monthlyRewardSettlement: {createMany: mocks.create, findUnique: mocks.task, findMany: mocks.tasks, updateMany: vi.fn()},
  monthlyRewardDelivery: {findMany: mocks.deliveries, findUnique: mocks.delivery, updateMany: mocks.updateDelivery},
}}));
vi.mock('@/utils', () => ({getRankingRewardKeys: () => ({dateInfo: {year: 2026, month: 9}})}));
vi.mock('@/services/walletLedger/monthlyRewardSettlement', () => ({monthlyRewardCursorId: (id: string) => `cursor-${id}`}));
vi.mock('@/cron/jobs/queue', () => ({monthlyRewardQueue: {getJob: mocks.getJob, add: mocks.add},
  monthlyRewardNotificationQueue: {isPaused: vi.fn().mockResolvedValue(false), getJob: mocks.getJob, add: mocks.add, getJobCounts: mocks.counts}}));
import {dispatchMonthlyRewards, enqueueMonthlyRewardTask, enqueueMonthlyRewardDelivery, recoverMonthlyRewards, monthlyRewardConfig} from '@/services/walletLedger/monthlyRewardQueue';
beforeEach(() => {
  vi.clearAllMocks(); mocks.cursor.mockResolvedValue(null); mocks.getJob.mockResolvedValue(null);
  mocks.tasks.mockResolvedValue([]); mocks.deliveries.mockResolvedValue([]);
  mocks.task.mockImplementation(async ({where}: any) => ({id: where.id, status: 'PENDING'}));
  mocks.counts.mockResolvedValue({waiting: 0, active: 0, delayed: 0});
});
it('validates bounded global and local worker settings', () => {
  expect(monthlyRewardConfig({})).toEqual({globalConcurrency: 4, localConcurrency: 4, notificationConcurrency: 1});
  expect(monthlyRewardConfig({MONTHLY_REWARD_GLOBAL_CONCURRENCY: '8'}).globalConcurrency).toBe(8);
  for (const value of ['0', '-1', '2.5', 'NaN', '65']) expect(() => monthlyRewardConfig({MONTHLY_REWARD_GLOBAL_CONCURRENCY: value})).toThrow();
});
it('persists category/mode/month tasks before enqueueing and surfaces queue outages', async () => {
  mocks.categories.mockResolvedValue([{id: 'category', game: {modes: ['SINGLE', 'MULTI']}}]);
  mocks.add.mockRejectedValueOnce(new Error('Redis unavailable'));
  await expect(dispatchMonthlyRewards()).rejects.toThrow('Redis unavailable');
  expect(mocks.create).toHaveBeenCalledWith({skipDuplicates: true, data: expect.arrayContaining([
    expect.objectContaining({catId: 'category', mode: 'SINGLE', year: 2026, month: 9}),
    expect.objectContaining({catId: 'category', mode: 'MULTI', year: 2026, month: 9}),
  ])});
  expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.add.mock.invocationCallOrder[0]);
});
it('enqueues the committed cursor and deduplicates an active step', async () => {
  mocks.cursor.mockResolvedValue({result: {nextRank: 501}});
  await enqueueMonthlyRewardTask('audit');
  expect(mocks.add).toHaveBeenCalledWith('monthly-reward-step', {settlementId: 'audit'}, expect.objectContaining({jobId: 'monthly-reward-audit-501', attempts: 5}));
  mocks.add.mockClear(); mocks.getJob.mockResolvedValue({getState: async () => 'active'});
  await enqueueMonthlyRewardTask('audit'); expect(mocks.add).not.toHaveBeenCalled();
});
it('retries failed steps, skips completed settlements, and recovers older durable tasks', async () => {
  const retry = vi.fn(); mocks.getJob.mockResolvedValue({getState: async () => 'failed', retry});
  mocks.tasks.mockResolvedValue([{id: 'old-period'}]);
  await recoverMonthlyRewards(); expect(retry).toHaveBeenCalledOnce();
  mocks.task.mockResolvedValue({status: 'COMPLETED'}); retry.mockClear();
  await enqueueMonthlyRewardTask('old-period'); expect(retry).not.toHaveBeenCalled();
});
it('keeps notification jobs small and leaves excess work in the durable outbox', async () => {
  mocks.delivery.mockResolvedValue({status: 'PENDING'});
  await enqueueMonthlyRewardDelivery('batch');
  expect(mocks.add).toHaveBeenCalledWith('monthly-reward-notifications', {batchId: 'batch'}, expect.objectContaining({jobId: 'monthly-reward-notifications-batch'}));
  mocks.add.mockClear(); mocks.counts.mockResolvedValue({waiting: 1000});
  await enqueueMonthlyRewardDelivery('batch'); expect(mocks.add).not.toHaveBeenCalled();
});
it('does not undo wallet progress when notification Redis is unavailable', async () => {
  mocks.delivery.mockResolvedValue({status: 'PENDING'}); mocks.counts.mockRejectedValueOnce(new Error('Redis unavailable'));
  await expect(enqueueMonthlyRewardDelivery('batch')).resolves.toBeUndefined();
});
