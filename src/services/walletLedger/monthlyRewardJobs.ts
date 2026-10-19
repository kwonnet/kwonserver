import {ensureRewardRanking} from '@/services/v1/games/periodRecovery';
import {createHash} from 'node:crypto';
import {Prisma, GameMode, GameMilestone} from '@prisma/client';
import {walletOperation} from '@/services/walletLedger';
import {monthlyGameSpendExact} from '@/services/walletLedger/game';
import {createMonthlyRewardCurve, monthlyRewardAtRank, monthlyRewardTier, monthlyRewardFunding, MONTHLY_REWARD_CAP, MonthlyRewardCurve} from '@/services/walletLedger/monthlyRewards';
import redisClient from '@/redis';
import prisma from '@/db';
import {getGameMode, getRankingRewardKeys} from '@/utils';
import {getRedisHashKey} from '@/services/helper';
import logger from '@/logger';
import {enqueueMonthlyRewardTask, enqueueMonthlyRewardDelivery} from '@/services/walletLedger/monthlyRewardQueue';
import {settleMonthlyRewardBatch, MONTHLY_REWARD_BATCH_SIZE, monthlyRewardCursorId, monthlyRewardBatchId} from '@/services/walletLedger/monthlyRewardSettlement';

type SettlementPlan = {
  policy: string; snapshot: string; participantCount: number; qualifyingPercent: number; poolPercent: number;
  curve: MonthlyRewardCurve; coinsSpent: string; bonusSpent: string; fundingBalance: string;
  categoryName?: string; milestones?: Pick<GameMilestone, 'id' | 'reason' | 'milestone' | 'thumbnail'>[];
};

function rewardAuditData(id: string, catId: string, mode: GameMode, dateInfo: {year: number; month: number},
  plan: SettlementPlan, monthStat?: {score: number; numPlayed: number} | null): Prisma.GameMonthRewardStatUncheckedCreateInput {
  const coins = new Prisma.Decimal(plan.coinsSpent), bonus = new Prisma.Decimal(plan.bonusSpent);
  const funding = new Prisma.Decimal(plan.fundingBalance), pool = new Prisma.Decimal(plan.curve.pool).div(100);
  return {
    id, catId, mode, ...dateInfo, status: 'PROCESSING', policyVersion: plan.policy,
    totalParticipants: plan.participantCount, rewardParticipants: plan.curve.winners,
    coinsRewardParticipants: 0, processedParticipants: 0,
    coinsSpent: coins, bonusSpent: bonus, grossSpent: coins.plus(bonus),
    bonusOffsetApplied: Prisma.Decimal.min(coins, bonus), bonusOffsetShortfall: Prisma.Decimal.max(0, bonus.minus(coins)),
    fundingBalance: funding, qualifyingPercentage: plan.qualifyingPercent, rewardPercentage: plan.poolPercent,
    rewardPoolAmount: pool, distributableAmount: new Prisma.Decimal(plan.curve.budget).div(100),
    retainedBalance: funding.minus(pool), capUnallocatedAmount: new Prisma.Decimal(plan.curve.unallocated).div(100),
    coinsShareAmount: 0, unallocatedAmount: pool, pendingAmount: new Prisma.Decimal(plan.curve.budget).div(100),
    balanceAfterPayout: funding, fullyAllocated: false,
    minimumReward: new Prisma.Decimal(plan.curve.minimum).div(100), maximumReward: new Prisma.Decimal(plan.curve.maximum).div(100),
    rewardCap: MONTHLY_REWARD_CAP / 100, snapshotKey: plan.snapshot, payoutPlan: plan.curve,
    startedAt: new Date(), rewardParticipantsScore: 0, coinsParticipantsScore: 0,
    numPlayed: monthStat?.numPlayed ?? 0, totalScore: monthStat?.score ?? 0,
  };
}

export const processMonthlyRewardStep = async (settlementId: string) => {
  const task = await prisma.monthlyRewardSettlement.findUniqueOrThrow({where: {id: settlementId}});
  if (task.status === 'COMPLETED') return;
  const item = {catId: task.catId, mode: task.mode};
  const {catId} = item;
  const mode = getGameMode(item.mode);
  // A queued/recovered job always uses its original accounting month.
  const keys = getRankingRewardKeys(catId, mode, {year: task.year, month: task.month});
  const period = `${catId}:${item.mode}:${keys.dateInfo.year}:${keys.dateInfo.month}`;
  const planKey = createHash('sha256').update(`monthly-reward-plan:${period}`).digest('hex');
  try {
    // In-progress audit rows must resume; completed historical periods must not pay again.
    const settled = await prisma.gameMonthRewardStat.findFirst({where: {catId, mode: item.mode, ...keys.dateInfo, status: {in: ['COMPLETED', 'LEGACY_COMPLETED']}}});
    if (settled) {
      await prisma.monthlyRewardSettlement.update({where: {id: task.id}, data: {status: 'COMPLETED', completedAt: new Date(), lastError: null}});
      return;
    }
    await prisma.monthlyRewardSettlement.updateMany({where: {id: task.id, status: {not: 'COMPLETED'}}, data: {
      status: 'PROCESSING', startedAt: task.startedAt ?? new Date(), nextAttemptAt: new Date(Date.now() + 60000),
    }});
    const previous = await prisma.walletOperation.findUnique({where: {id: planKey}});
    let plan = previous?.result as SettlementPlan | undefined;
    if (!plan) {
      await ensureRewardRanking(catId,item.mode,{kind:'month',...keys.dateInfo});
      // COPY without REPLACE freezes identity, scores and tie order for retries.
      const snapshot = `${keys.rewardMonth}:settlement:monthly-90-v2`;
      if (await redisClient.exists(keys.rewardMonth)) {
        await redisClient.copy(keys.rewardMonth, snapshot);
        await redisClient.persist(snapshot);
      }
      const participantCount = await redisClient.zCard(snapshot);
      const tier = monthlyRewardTier(participantCount);
      const spent = await monthlyGameSpendExact(catId, item.mode, keys.dateInfo.year, keys.dateInfo.month);
      // Funding policy offsets recorded bonus spending against actual coin debits.
      const funding = monthlyRewardFunding(spent.coins, spent.bonus, tier.poolPercent);
      const [category, milestones] = await Promise.all([
        prisma.gameCategory.findUniqueOrThrow({where: {id: catId}}),
        prisma.gameMilestone.findMany({where: {name: 'MONTH'}, select: {id: true, reason: true, milestone: true, thumbnail: true}}),
      ]);
      const candidate: SettlementPlan = {policy: 'monthly-90-v2', snapshot, participantCount,
        categoryName: category.name, milestones, qualifyingPercent: tier.qualifyingPercent, poolPercent: tier.poolPercent,
        curve: createMonthlyRewardCurve(funding.poolMinor, tier.winners),
        coinsSpent: funding.coinsSpent, bonusSpent: funding.bonusSpent, fundingBalance: funding.fundingBalance};
      const monthStat = await getRedisHashKey<{score: number; numPlayed: number}>(keys.rewardMonthStat);
      plan = await walletOperation('monthly-reward-plan', period, {policy: 'monthly-90-v2'}, [], async tx => {
        await tx.gameMonthRewardStat.create({data: rewardAuditData(planKey, catId, item.mode, keys.dateInfo, candidate, monthStat)});
        return candidate;
      });
    }
    if (plan.policy !== 'monthly-90-v2') throw new Error('Unsupported monthly settlement policy');
    const audit = await prisma.gameMonthRewardStat.findUnique({where: {id: planKey}});
    if (!audit) throw new Error('Existing unaudited monthly plan requires reconciliation');
    if (audit.status !== 'PROCESSING') await prisma.gameMonthRewardStat.updateMany({where: {id: planKey, status: {not: 'COMPLETED'}}, data: {status: 'PROCESSING', lastError: null}});
    if (plan.participantCount > 0 && !await redisClient.exists(plan.snapshot)) throw new Error('Monthly reward snapshot missing; restore it before retrying settlement');
    if (await redisClient.zCard(plan.snapshot) !== plan.participantCount) throw new Error('Monthly reward snapshot changed');
    logger.info({catId, mode: item.mode, period, ...plan}, 'Monthly coin reward plan');
    if (plan.curve.unallocated) logger.warn({period, unallocatedMinorUnits: plan.curve.unallocated}, 'Pool exceeds winner payout capacity; excess remains unpaid');
    const categoryName = plan.categoryName ?? (await prisma.gameCategory.findUniqueOrThrow({where: {id: catId}})).name;
    const milestones = plan.milestones ?? await prisma.gameMilestone.findMany({where: {name: 'MONTH'}});
    const batchSize = MONTHLY_REWARD_BATCH_SIZE;
    const started = performance.now();
    const cursor = await prisma.walletOperation.findUnique({where: {id: monthlyRewardCursorId(planKey)}});
    const nextRank = (cursor?.result as {nextRank?: number})?.nextRank ?? 1;
    if (!Number.isInteger(nextRank) || nextRank < 1 || nextRank > plan.curve.winners + 1) throw new Error('Invalid monthly reward cursor');
    const offset = nextRank - 1;
    if (offset < plan.curve.winners) {
      const end = Math.min(offset + batchSize, plan.curve.winners) - 1;
      const participants = await redisClient.zRangeWithScores(plan.snapshot, offset, end, {REV: true});
      if (participants.length !== end - offset + 1) throw new Error('Incomplete monthly reward snapshot batch');
      const batchStarted = performance.now();
      await settleMonthlyRewardBatch({catId, categoryName, mode: item.mode,
        dateInfo: keys.dateInfo, auditId: planKey, milestones, queueNotifications: true,
        players: participants.map((member, index) => ({id: member.value, rank: offset + index + 1,
          score: member.score, rewardAmount: monthlyRewardAtRank(plan.curve, offset + index + 1) / 100})),
      });
      await enqueueMonthlyRewardDelivery(monthlyRewardBatchId(planKey, offset + 1, end + 1));
      logger.info({event: 'monthly_reward_batch', catId, mode: item.mode, offset, end,
        participants: participants.length, durationMs: Math.round(performance.now() - batchStarted),
        elapsedMs: Math.round(performance.now() - started)}, 'Monthly reward batch committed');
      await prisma.monthlyRewardSettlement.updateMany({where: {id: task.id, status: {not: 'COMPLETED'}}, data: {
        lastError: null, failures: 0, nextAttemptAt: new Date(Date.now() + 60000),
      }});
      if (end + 1 < plan.curve.winners) {
        // Yield to the queue after one bounded batch so other categories get a turn.
        await enqueueMonthlyRewardTask(task.id);
        return;
      }
    }
    await walletOperation('monthly-reward-stat', period, {}, [], async tx => {
      const audit = await tx.gameMonthRewardStat.findUniqueOrThrow({where: {id: planKey}});
      if (audit.processedParticipants !== plan.curve.winners || !audit.pendingAmount?.isZero()) throw new Error('Monthly settlement has unpaid awards');
      const stat = await tx.gameMonthRewardStat.update({where: {id: planKey}, data: {
        status: 'COMPLETED', completedAt: new Date(), lastError: null,
        fullyAllocated: audit.unallocatedAmount?.isZero() ?? false,
      }});
      return {id: stat.id};
    });
    // Incomplete runs retain their snapshot indefinitely; settled runs no longer
    // need it for replay, so keep only a short inspection window.
    await prisma.monthlyRewardSettlement.update({where: {id: task.id}, data: {
      status: 'COMPLETED', completedAt: new Date(), lastError: null, failures: 0,
    }});
    await redisClient.expire(plan.snapshot, 7 * 24 * 60 * 60);
  } catch (error) {
    try {
      await prisma.monthlyRewardSettlement.updateMany({where: {id: task.id, status: {not: 'COMPLETED'}}, data: {
        status: 'FAILED', failures: {increment: 1},
        lastError: error instanceof Error ? error.message.slice(0, 1000) : 'Monthly settlement failed',
        nextAttemptAt: new Date(Date.now() + Math.min(30, 2 ** Math.min(task.failures, 5)) * 60000),
      }});
      await prisma.gameMonthRewardStat.updateMany({where: {id: planKey, status: {not: 'COMPLETED'}}, data: {
        status: 'FAILED', lastError: error instanceof Error ? error.message.slice(0, 1000) : 'Monthly settlement failed',
      }});
    } catch (auditError) { logger.error({auditError, period}, 'Unable to record monthly settlement failure'); }
    throw error;
  }
};

