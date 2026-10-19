import {createHash} from 'node:crypto';
import {Prisma, GameMode, RewardTypeEnum, TxnCategoryEnum, TxnCurrencyEnum, TxnGatewayEnum, TxnSourceEnum, TxnStatusEnum, TxnTypeEnum} from '@prisma/client';
import {walletOperation, cents} from '@/services/walletLedger';
import {monthlyGameSpendExact} from '@/services/walletLedger/game';
import {createMonthlyRewardCurve, monthlyRewardAtRank, monthlyRewardTier, monthlyRewardFunding, MONTHLY_REWARD_CAP, MonthlyRewardCurve} from '@/services/walletLedger/monthlyRewards';
import {formatNumberWithCommas} from '@/utils/helpers';
import redisClient from '@/redis';
import {PromisePool} from '@supercharge/promise-pool';
import prisma from '@/db';
import {generateUniqueRef, getGameMode, getRankingRewardKeys, getStringMonth} from '@/utils';
import {getRedisHashKey} from '@/services/helper';
import logger from '@/logger';
import {enqueueNotificationDelivery} from '@/services/v1/notifications';

const distributeReward = async ({player, catId, rewardAmount, dateInfo, mode, auditId}: {
  player: {id: string; rank: number; score: number}; catId: string; rewardAmount: number;
  mode: GameMode; dateInfo: {year: number; month: number}; auditId: string;
}) => {
  cents(rewardAmount, true);
  const [category, milestones] = await prisma.$transaction([
    prisma.gameCategory.findFirst({where: {id: catId}}),
    prisma.gameMilestone.findMany({where: {name: 'MONTH'}}),
  ]);
  if (!category) throw new Error('Monthly reward category missing');
  const milestone = milestones.find(m => m.milestone === player.rank);
  const receipt = await walletOperation('monthly-reward', `${catId}:${mode}:${dateInfo.year}:${dateInfo.month}:${player.id}:COINS`,
    {playerId: player.id, rewardAmount, policy: 'monthly-90-v2'}, [player.id], async tx => {
      let transactionId: string | undefined;
      let notificationId: string | undefined;
      if (rewardAmount > 0) {
        const txnRef = generateUniqueRef();
        const description = milestone
          ? `Rewarded ${rewardAmount} COINS for achieving ${milestone.reason?.replace(/_/g, ' ').toLowerCase()} under ${category.name} category in ${getStringMonth(dateInfo.month)} ${dateInfo.year}.`
          : `Rewarded ${rewardAmount} COINS for ranking ${formatNumberWithCommas(player.rank)}th under ${category.name} category in ${getStringMonth(dateInfo.month)} ${dateInfo.year}.`;
        const achievement = milestone ? await tx.gameAchievement.create({data: {
          reason: milestone.reason, playerId: player.id, catId, mode, amount: rewardAmount,
          rewardType: RewardTypeEnum.COINS, milestoneId: milestone.id, description,
          thumbnail: milestone.thumbnail, metadata: {txnRef, ...dateInfo},
        }}) : undefined;
        const wallet = await tx.wallet.update({where: {userId: player.id}, data: {coins: {increment: rewardAmount}}});
        const txn = await tx.transaction.create({data: {
          userId: player.id, recipientId: player.id, walletId: wallet.id, amount: rewardAmount,
          gateway: TxnGatewayEnum.WALLET, source: TxnSourceEnum.COINS, type: TxnTypeEnum.CREDIT,
          status: TxnStatusEnum.COMPLETED, currency: TxnCurrencyEnum.COINS,
          category: TxnCategoryEnum.GAME_MONTHLY_REWARD, description, txnRef,
          metadata: {...dateInfo, catId, mode, policy: 'monthly-90-v2', auditId, rank: player.rank, score: player.score},
          achievementId: achievement?.id ?? null,
        }});
        transactionId = txn.id;
        const notification = await tx.notification.create({data: {
          sourceKey: `monthly-game-reward:${catId}:${mode}:${dateInfo.year}:${dateInfo.month}:${player.id}`,
          recipientId: player.id, type: 'NONE', action: 'NONE', title: 'Monthly game reward',
          message: `You earned ${formatNumberWithCommas(rewardAmount)} coins for ranking #${formatNumberWithCommas(player.rank)} in ${category.name} (${mode === GameMode.SINGLE ? 'Single player' : 'Multiplayer'}) for ${getStringMonth(dateInfo.month)} ${dateInfo.year}. Your wallet has been credited.`,
          meta: {kind: 'monthly-game-reward', catId, categoryName: category.name, mode, ...dateInfo,
            rank: player.rank, amount: rewardAmount, currency: 'COINS', transactionId: txn.id, auditId},
        }});
        notificationId = notification.id;
        if (achievement) await tx.gameAchievement.update({where: {id: achievement.id}, data: {txnId: txn.id}});
      }
      // Progress commits with the wallet credit and receipt; replay cannot increment it twice.
      await tx.gameMonthRewardStat.update({where: {id: auditId}, data: {
        processedParticipants: {increment: 1}, coinsRewardParticipants: {increment: rewardAmount > 0 ? 1 : 0},
        coinsShareAmount: {increment: rewardAmount}, pendingAmount: {decrement: rewardAmount},
        unallocatedAmount: {decrement: rewardAmount}, balanceAfterPayout: {decrement: rewardAmount},
        rewardParticipantsScore: {increment: player.score}, coinsParticipantsScore: {increment: player.score},
      }});
      return {auditId, transactionId: transactionId ?? null, notificationId: notificationId ?? null};
    });
  if (receipt.notificationId) await enqueueNotificationDelivery(receipt.notificationId);
};

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
    const batchSize = 200;
    for (let offset = 0; offset < plan.curve.winners; offset += batchSize) {
      const end = Math.min(offset + batchSize, plan.curve.winners) - 1;
      const participants = await redisClient.zRangeWithScores(plan.snapshot, offset, end, {REV: true});
      if (participants.length !== end - offset + 1) throw new Error('Incomplete monthly reward snapshot batch');
      await Promise.all(participants.map(async (member, index) => {
        const rank = offset + index + 1;
        await distributeReward({player: {id: member.value, rank, score: member.score}, catId, mode: item.mode, auditId: planKey,
          rewardAmount: monthlyRewardAtRank(plan.curve, rank) / 100, dateInfo: keys.dateInfo});
      }));
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
