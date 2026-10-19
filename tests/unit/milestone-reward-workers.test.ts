import {expect, it, vi} from 'vitest';
const deps = vi.hoisted(() => ({setGlobal: vi.fn(), Worker: vi.fn(), run: vi.fn().mockResolvedValue(undefined),
 close: vi.fn(), quit: vi.fn(), recover: vi.fn(), process: vi.fn()}));
vi.mock('bullmq', () => ({Worker: class {
 constructor(...args: unknown[]) {deps.Worker(...args);} name = 'milestones'; on = vi.fn(); run = deps.run; close = deps.close;
}}));
vi.mock('ioredis', () => ({default: class {on = vi.fn(); quit = deps.quit;}}));
vi.mock('@/cron/jobs/queue', () => ({milestoneRewardQueue: {name: 'milestones', setGlobalConcurrency: deps.setGlobal}}));
vi.mock('@/services/walletLedger/milestoneRewardQueue', () => ({milestoneRewardConfig: () => ({globalConcurrency: 4, localConcurrency: 2}), recoverMilestoneRewards: deps.recover}));
vi.mock('@/services/walletLedger/milestoneRewardJobs', () => ({processMilestoneRewardTask: deps.process}));
import {startMilestoneRewardWorkers, processMilestoneRewardJob} from '@/cron/milestoneRewards';
it('starts bounded workers, recovers durable tasks on startup and closes owned connections', async () => {
 vi.stubEnv('REDIS_URL', 'redis://localhost:16379');
 const service = await startMilestoneRewardWorkers();
 try {
  expect(deps.setGlobal).toHaveBeenCalledWith(4);
  expect(deps.Worker).toHaveBeenCalledWith('milestones', expect.any(Function), expect.objectContaining({concurrency: 2, autorun: false, maxStalledCount: 3}));
  expect(deps.recover).toHaveBeenCalledOnce();
 } finally {await service.close(); vi.unstubAllEnvs();}
 expect(deps.close).toHaveBeenCalledOnce(); expect(deps.quit).toHaveBeenCalledOnce();
});
it('validates the queue envelope before calling the payout service', async () => {
 await expect(processMilestoneRewardJob({name: 'milestone-reward', data: {taskId: '../unsafe'}})).rejects.toThrow('Invalid');
 expect(deps.process).not.toHaveBeenCalled();
 await processMilestoneRewardJob({name: 'milestone-reward', data: {taskId: 'a'.repeat(64)}});
 expect(deps.process).toHaveBeenCalledWith('a'.repeat(64));
});
