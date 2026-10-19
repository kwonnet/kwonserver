import {createHash} from 'node:crypto';
import {Prisma, GameMode} from '@prisma/client';
import {walletOperation} from '@/services/walletLedger';
import {monthlyGameSpendExact} from '@/services/walletLedger/game';
import {createMonthlyRewardCurve, monthlyRewardAtRank, monthlyRewardTier, monthlyRewardFunding, MONTHLY_REWARD_CAP, MonthlyRewardCurve} from '@/services/walletLedger/monthlyRewards';
import redisClient from '@/redis';
import {PromisePool} from '@supercharge/promise-pool';
import prisma from '@/db';
import {getGameMode, getRankingRewardKeys} from '@/utils';
import {getRedisHashKey} from '@/services/helper';
import logger from '@/logger';
import {enqueueNotificationDeliveries} from '@/services/v1/notifications';
import {settleMonthlyRewardBatch, MONTHLY_REWARD_BATCH_SIZE, monthlyRewardCursorId} from '@/services/walletLedger/monthlyRewardSettlement';

type SettlementPlan = {
  policy: string; snapshot: string; participantCount: number; qualifyingPercent: number; poolPercent: number;
  curve: MonthlyRewardCurve; coinsSpent: string; bonusSpent: string; fundingBalance: string;
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

const rewardMonthlyPlayers = async (item: {catId: string; gameId: string; mode: GameMode}) => {
  const {catId} = item;
  const mode = getGameMode(item.mode);
  const keys = getRankingRewardKeys(catId, mode);
  const period = `${catId}:${item.mode}:${keys.dateInfo.year}:${keys.dateInfo.month}`;
  const planKey = createHash('sha256').update(`monthly-reward-plan:${period}`).digest('hex');
  try {
    // In-progress audit rows must resume; completed historical periods must not pay again.
    const settled = await prisma.gameMonthRewardStat.findFirst({where: {catId, mode: item.mode, ...keys.dateInfo, status: {in: ['COMPLETED', 'LEGACY_COMPLETED']}}});
    if (settled) return;
    const previous = await prisma.walletOperation.findUnique({where: {id: planKey}});
    let plan = previous?.result as SettlementPlan | undefined;
    if (!plan) {
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
      const candidate: SettlementPlan = {policy: 'monthly-90-v2', snapshot, participantCount,
        qualifyingPercent: tier.qualifyingPercent, poolPercent: tier.poolPercent,
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
    await prisma.gameMonthRewardStat.updateMany({where: {id: planKey, status: {not: 'COMPLETED'}}, data: {status: 'PROCESSING', lastError: null}});
    if (plan.participantCount > 0 && !await redisClient.exists(plan.snapshot)) throw new Error('Monthly reward snapshot missing; restore it before retrying settlement');
    if (await redisClient.zCard(plan.snapshot) !== plan.participantCount) throw new Error('Monthly reward snapshot changed');
    logger.info({catId, mode: item.mode, period, ...plan}, 'Monthly coin reward plan');
    if (plan.curve.unallocated) logger.warn({period, unallocatedMinorUnits: plan.curve.unallocated}, 'Pool exceeds winner payout capacity; excess remains unpaid');
    const category = await prisma.gameCategory.findUniqueOrThrow({where: {id: catId}});
    const milestones = await prisma.gameMilestone.findMany({where: {name: 'MONTH'}});
    const batchSize = MONTHLY_REWARD_BATCH_SIZE;
    const started = performance.now();
    let visitedParticipants = 0;
    const cursor = await prisma.walletOperation.findUnique({where: {id: monthlyRewardCursorId(planKey)}});
    const nextRank = (cursor?.result as {nextRank?: number})?.nextRank ?? 1;
    if (!Number.isInteger(nextRank) || nextRank < 1 || nextRank > plan.curve.winners + 1) throw new Error('Invalid monthly reward cursor');
    for (let offset = nextRank - 1; offset < plan.curve.winners; offset += batchSize) {
      const end = Math.min(offset + batchSize, plan.curve.winners) - 1;
      const participants = await redisClient.zRangeWithScores(plan.snapshot, offset, end, {REV: true});
      if (participants.length !== end - offset + 1) throw new Error('Incomplete monthly reward snapshot batch');
      const batchStarted = performance.now();
      const result = await settleMonthlyRewardBatch({catId, categoryName: category.name, mode: item.mode,
        dateInfo: keys.dateInfo, auditId: planKey, milestones,
        players: participants.map((member, index) => ({id: member.value, rank: offset + index + 1,
          score: member.score, rewardAmount: monthlyRewardAtRank(plan.curve, offset + index + 1) / 100})),
      });
      await enqueueNotificationDeliveries(result.notificationIds);
      visitedParticipants += participants.length;
      logger.info({event: 'monthly_reward_batch', catId, mode: item.mode, offset, end,
        participants: participants.length, durationMs: Math.round(performance.now() - batchStarted),
        elapsedMs: Math.round(performance.now() - started), visitedParticipants}, 'Monthly reward batch committed');
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
    await redisClient.expire(plan.snapshot, 7 * 24 * 60 * 60);
  } catch (error) {
    try {
      await prisma.gameMonthRewardStat.updateMany({where: {id: planKey, status: {not: 'COMPLETED'}}, data: {
        status: 'FAILED', lastError: error instanceof Error ? error.message.slice(0, 1000) : 'Monthly settlement failed',
      }});
    } catch (auditError) { logger.error({auditError, period}, 'Unable to record monthly settlement failure'); }
    throw error;
  }
};

// Main reward execution
const rewardPlayers = async () => {
  try {
    const categories = await prisma.gameCategory.findMany({
      include: { game: true },
    });

    if (categories.length === 0)
      throw new Error("No game categories available");

    // loop through each category game modes and compose each category by mode.
    const result = categories.map(c => {
      return c.game.modes.map(m => {
        return { catId: c.id, gameId: c.gameId, mode: m  }
      })
    }).flat()

    const { results, errors } = await PromisePool.for(result)
      .withConcurrency(2)
      .process(async ({ catId, gameId, mode }) => {
        await rewardMonthlyPlayers({ catId, gameId, mode });
      });

    if (errors.length > 0) {
      logger.error(
        `Errors during rewards processing: ${errors
          .map((e) => e.message)
          .join(", ")}`
      );
    }

    if (errors.length) throw new Error(errors.map(e => e.message).join(", "));
    return results;
  } catch (error: any) {
    logger.error(`Error rewarding players: ${error.message}`);
    throw error;
  }
};

export async function run() {
  await rewardPlayers();
}
