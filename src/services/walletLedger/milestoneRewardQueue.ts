import {createHash} from 'node:crypto';
import {GameMode, Prisma} from '@prisma/client';
import {PromisePool} from '@supercharge/promise-pool';
import prisma from '@/db';
import {getRankingRewardKeys, getRewardDateInfo} from '@/utils';
import {ensureRewardJob} from './monthlyRewardQueue';

export type MilestoneRewardKind = 'WEEK' | 'YEAR' | 'CHAMP' | 'GRAND_CHAMP';
export const rewardHash = (value: string) => createHash('sha256').update(value).digest('hex');
export function milestoneRewardConfig(env: NodeJS.ProcessEnv = process.env) {
  const read = (name: string, fallback: number, max: number) => {
    const value = Number(env[name] ?? fallback);
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`${name} must be an integer from 1 to ${max}`);
    return value;
  };
  return {globalConcurrency: read('MILESTONE_REWARD_GLOBAL_CONCURRENCY', 4, 16),
    localConcurrency: read('MILESTONE_REWARD_LOCAL_CONCURRENCY', 4, 16)};
}
async function enqueueAll(ids: string[]) {
  const {errors} = await PromisePool.for(ids).withConcurrency(8).process(async id => { await enqueueMilestoneReward(id); });
  if (errors.length) throw new Error(`Milestone reward dispatch failed: ${errors.map(e => e.message).join('; ')}`);
}
export async function enqueueMilestoneReward(id: string) {
  const task = await prisma.gameMilestoneRewardTask.findUnique({where: {id}});
  if (!task || (task.status === 'COMPLETED' && !task.cachePending)) return;
  const {milestoneRewardQueue} = await import('@/cron/jobs/queue');
  await ensureRewardJob(milestoneRewardQueue, 'milestone-reward', `milestone-reward-${id}`, {taskId: id});
  await prisma.gameMilestoneRewardTask.updateMany({where: {id, OR: [{status: {not: 'COMPLETED'}}, {cachePending: true}]},
    data: {nextAttemptAt: new Date(Date.now() + 60000)}});
}
/** Persist all small scopes first; the cron consumer never performs a payout. */
export async function dispatchMilestoneRewards(kind: MilestoneRewardKind) {
  const info = getRewardDateInfo();
  const tasks: Prisma.GameMilestoneRewardTaskCreateManyInput[] = [];
  const add = (scopeId: string, mode: GameMode | null, rankingKey?: string) => {
    const year = kind === 'WEEK' ? info.weeklyRewardYear : info.yearlyRewardYear;
    const week = kind === 'WEEK' ? info.weeklyRewardWeek : 0;
    tasks.push({id: rewardHash(`game-milestone:${kind}:${scopeId}:${mode ?? 'ALL'}:${year}:${week}`),
      kind, scopeId, mode, year, week, rankingKey});
  };
  if (kind === 'GRAND_CHAMP') add('global', null);
  else if (kind === 'CHAMP') {
    for (const game of await prisma.game.findMany({select: {id: true, modes: true}})) {
      for (const mode of game.modes) add(game.id, mode);
    }
  } else {
    for (const category of await prisma.gameCategory.findMany({include: {game: true}})) {
      for (const mode of category.game.modes) {
        add(category.id, mode, kind === 'WEEK'
          ? getRankingRewardKeys(category.id, mode === 'SINGLE' ? 'single' : 'multi').rewardWeek : undefined);
      }
    }
  }
  await prisma.gameMilestoneRewardTask.createMany({data: tasks, skipDuplicates: true});
  await enqueueAll(tasks.map(t => t.id));
  return {dispatched: tasks.length};
}
/** The database also recovers old periods and payments awaiting cache invalidation. */
export async function recoverMilestoneRewards() {
  const tasks = await prisma.gameMilestoneRewardTask.findMany({where: {
    nextAttemptAt: {lte: new Date()}, OR: [{status: {not: 'COMPLETED'}}, {cachePending: true}],
  }, orderBy: [{nextAttemptAt: 'asc'}, {id: 'asc'}], take: 1000, select: {id: true}});
  await enqueueAll(tasks.map(t => t.id));
}
