import {expect, it, vi} from 'vitest';
const mocks = vi.hoisted(() => ({setGlobalConcurrency: vi.fn(), setNotificationConcurrency: vi.fn(),
  Worker: vi.fn(), run: vi.fn().mockResolvedValue(undefined), close: vi.fn(), quit: vi.fn(), step: vi.fn(), deliver: vi.fn()}));
vi.mock('bullmq', () => ({Worker: class {
  constructor(...args: unknown[]) {mocks.Worker(...args);}
  name = 'test'; on = vi.fn(); run = mocks.run; close = mocks.close;
}}));
vi.mock('ioredis', () => ({default: class {on = vi.fn(); quit = mocks.quit;}}));
vi.mock('@/cron/jobs/queue', () => ({monthlyRewardQueue: {name: 'rewards', setGlobalConcurrency: mocks.setGlobalConcurrency},
  monthlyRewardNotificationQueue: {name: 'reward-notifications', setGlobalConcurrency: mocks.setNotificationConcurrency}}));
vi.mock('@/services/walletLedger/monthlyRewardQueue', () => ({recoverMonthlyRewards: vi.fn(), monthlyRewardConfig: () => ({globalConcurrency: 8, localConcurrency: 4, notificationConcurrency: 1})}));
vi.mock('@/services/walletLedger/monthlyRewardJobs', () => ({processMonthlyRewardStep: mocks.step}));
vi.mock('@/services/walletLedger/monthlyRewardNotifications', () => ({deliverMonthlyRewardBatch: mocks.deliver}));
import {startMonthlyRewardWorkers, processMonthlyRewardJob, processMonthlyRewardNotificationJob} from '@/cron/monthlyRewards';
it('uses dedicated queues and global limits, starts promptly, and closes every connection', async () => {
  vi.stubEnv('REDIS_URL', 'redis://localhost:16379');
  const service = await startMonthlyRewardWorkers();
  expect(mocks.setGlobalConcurrency).toHaveBeenCalledWith(8); expect(mocks.setNotificationConcurrency).toHaveBeenCalledWith(1);
  expect(mocks.Worker).toHaveBeenCalledWith('rewards', expect.any(Function), expect.objectContaining({concurrency: 4, maxStalledCount: 3}));
  await service.close(); expect(mocks.close).toHaveBeenCalledTimes(2); expect(mocks.quit).toHaveBeenCalledOnce();
  vi.unstubAllEnvs();
});
it('rejects malformed jobs before reading or changing financial records', async () => {
  await expect(processMonthlyRewardJob({name: 'wrong', data: {settlementId: 'a'.repeat(64)}})).rejects.toThrow('Invalid');
  await expect(processMonthlyRewardNotificationJob({name: 'monthly-reward-notifications', data: {batchId: '../unsafe'}})).rejects.toThrow('Invalid');
  expect(mocks.step).not.toHaveBeenCalled(); expect(mocks.deliver).not.toHaveBeenCalled();
  await processMonthlyRewardJob({name: 'monthly-reward-step', data: {settlementId: 'a'.repeat(64)}});
  expect(mocks.step).toHaveBeenCalledWith('a'.repeat(64));
});
