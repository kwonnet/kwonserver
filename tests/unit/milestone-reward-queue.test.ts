import {beforeEach, expect, it, vi} from 'vitest';
const deps = vi.hoisted(() => ({categories: vi.fn(), games: vi.fn(), create: vi.fn(), task: vi.fn(), tasks: vi.fn(),
 update: vi.fn(), ensure: vi.fn()}));
vi.mock('@/db', () => ({default: {gameCategory: {findMany: deps.categories}, game: {findMany: deps.games},
 gameMilestoneRewardTask: {createMany: deps.create, findUnique: deps.task, findMany: deps.tasks, updateMany: deps.update}}}));
vi.mock('@/utils', () => ({getRewardDateInfo: () => ({yearlyRewardYear: 2025, weeklyRewardYear: 2026, weeklyRewardWeek: 41}),
 getRankingRewardKeys: () => ({rewardWeek: 'original-week-key'})}));
vi.mock('@/services/walletLedger/monthlyRewardQueue', () => ({ensureRewardJob: deps.ensure}));
vi.mock('@/cron/jobs/queue', () => ({milestoneRewardQueue: {name: 'milestones'}}));
import {dispatchMilestoneRewards, enqueueMilestoneReward, recoverMilestoneRewards, milestoneRewardConfig} from '@/services/walletLedger/milestoneRewardQueue';
beforeEach(() => {
 vi.clearAllMocks(); deps.categories.mockResolvedValue([{id: 'category', game: {modes: ['SINGLE','MULTI']}}]);
 deps.games.mockResolvedValue([{id: 'game', modes: ['SINGLE','MULTI']}]); deps.ensure.mockResolvedValue(undefined);
 deps.task.mockImplementation(async ({where}: any) => ({id: where.id, status: 'PENDING'}));
 deps.tasks.mockResolvedValue([]);
});
it('pins annual rewards to the previous calendar year even when the monthly year differs', async () => {
 await dispatchMilestoneRewards('YEAR');
 expect(deps.create).toHaveBeenCalledWith({skipDuplicates: true, data: expect.arrayContaining([
  expect.objectContaining({kind: 'YEAR', scopeId: 'category', mode: 'SINGLE', year: 2025, week: 0}),
  expect.objectContaining({kind: 'YEAR', scopeId: 'category', mode: 'MULTI', year: 2025, week: 0}),
 ])});
});
it('persists pinned weekly tasks before queueing and leaves tasks recoverable on Redis failure', async () => {
 deps.ensure.mockRejectedValueOnce(new Error('Queue unavailable'));
 await expect(dispatchMilestoneRewards('WEEK')).rejects.toThrow('Queue unavailable');
 expect(deps.create.mock.invocationCallOrder[0]).toBeLessThan(deps.ensure.mock.invocationCallOrder[0]);
 expect(deps.create.mock.calls[0][0].data).toEqual(expect.arrayContaining([
  expect.objectContaining({year: 2026, week: 41, rankingKey: 'original-week-key'}),
 ]));
});
it('dispatches one game task per mode and one grand champion across all modes', async () => {
 await dispatchMilestoneRewards('CHAMP');
 expect(deps.create.mock.calls[0][0].data).toHaveLength(2);
 await dispatchMilestoneRewards('GRAND_CHAMP');
 expect(deps.create.mock.calls[1][0].data).toEqual([expect.objectContaining({scopeId: 'global', mode: null, kind: 'GRAND_CHAMP', year: 2025})]);
});
it('skips complete tasks but retries cache invalidation without rerunning payment', async () => {
 deps.task.mockResolvedValue({status: 'COMPLETED', cachePending: false});
 await enqueueMilestoneReward('done'); expect(deps.ensure).not.toHaveBeenCalled();
 deps.task.mockResolvedValue({status: 'COMPLETED', cachePending: true});
 await enqueueMilestoneReward('cache'); expect(deps.ensure).toHaveBeenCalledWith(expect.anything(), 'milestone-reward', 'milestone-reward-cache', {taskId: 'cache'});
});
it('recovers older due tasks in bounded, oldest-first pages', async () => {
 deps.tasks.mockResolvedValue([{id: 'older-period'}]);
 await recoverMilestoneRewards();
 expect(deps.tasks).toHaveBeenCalledWith(expect.objectContaining({take: 1000, orderBy: [{nextAttemptAt: 'asc'}, {id: 'asc'}]}));
 expect(deps.ensure).toHaveBeenCalledWith(expect.anything(), 'milestone-reward', 'milestone-reward-older-period', {taskId: 'older-period'});
});
it('rejects settings outside the supported database concurrency budget', () => {
 for (const value of ['0','17','1.5','NaN']) expect(() => milestoneRewardConfig({MILESTONE_REWARD_LOCAL_CONCURRENCY: value})).toThrow();
});
