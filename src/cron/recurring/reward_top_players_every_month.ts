import {createHash} from 'node:crypto';
import {Prisma, GameMode, RewardTypeEnum, TxnCategoryEnum, TxnCurrencyEnum, TxnGatewayEnum, TxnSourceEnum, TxnStatusEnum, TxnTypeEnum} from '@prisma/client';
import {walletOperation, cents} from '@/services/walletLedger';
import {monthlyGameSpendExact} from '@/services/walletLedger/game';
import {createMonthlyRewardCurve, monthlyRewardAtRank, monthlyRewardTier, MonthlyRewardCurve} from '@/services/walletLedger/monthlyRewards';
import {formatNumberWithCommas} from '@/utils/helpers';
import redisClient from '@/redis';
import {PromisePool} from '@supercharge/promise-pool';
import prisma from '@/db';
import {generateUniqueRef, getGameMode, getRankingRewardKeys, getStringMonth} from '@/utils';
import {getRedisHashKey} from '@/services/helper';
import logger from '@/logger';

const distributeReward = async ({
  player,
  catId,
  rewardAmount,
  dateInfo,
  mode,
}: {
  player: {id: string; rank: number};
  catId: string;
  rewardAmount: number;
  mode: GameMode;
  dateInfo: { year: number, month: number};
}) => {
  const rewardType = RewardTypeEnum.COINS;
  const rewardCurrency = TxnCurrencyEnum.COINS;
  if (rewardAmount === 0) return;
  cents(rewardAmount);
  const txnRef = generateUniqueRef();
  // Fetch category and milestone data
  const [category, milestones] = await prisma.$transaction([
    prisma.gameCategory.findFirst({ where: { id: catId } }),
    prisma.gameMilestone.findMany({ where: { name: "MONTH" } }),
  ]);
  if (!category) throw new Error('Monthly reward category missing');
  // Identify the player's milestone
  const milestone = milestones.find((m) => m.milestone === player.rank);
  // Every qualifying player is paid spendable coins; no bonus settlement.
  const walletField = {coins: {increment: rewardAmount}};
  // perform transaction
  await walletOperation('monthly-reward', `${catId}:${mode}:${dateInfo.year}:${dateInfo.month}:${player.id}:${rewardType}`, { playerId: player.id, rewardAmount, policy: "monthly-90-v1" }, [player.id], async (tx) => {
    // Create `gameAchievement` record if a milestone exists
    let achievement;
    if (milestone) {
      achievement = await tx.gameAchievement.create({
        data: {
          reason: milestone.reason,
          playerId: player.id,
          catId,
          mode,
          amount: rewardAmount,
          rewardType,
          milestoneId: milestone.id,
          description: `Rewarded ${rewardAmount} ${rewardType} and a trophy for achieving ${milestone.reason
            ?.replace(/_/g, " ")
            .toLowerCase()} under ${category.name} category in ${getStringMonth(dateInfo.month)} ${dateInfo.year}.`,
          thumbnail: milestone.thumbnail,
          metadata: { txnRef, ...dateInfo },
        },
      });
    }

    // Update the player's wallet
    const wallet = await tx.wallet.update({
      where: { userId: player.id },
      data: walletField,
    });

    // Create transaction record
    const txn = await tx.transaction.create({
      data: {
        userId: player.id,
        recipientId: player.id,
        walletId: wallet.id,
        amount: rewardAmount,
        gateway: TxnGatewayEnum.WALLET,
        source: TxnSourceEnum.COINS,
        type: TxnTypeEnum.CREDIT,
        status: TxnStatusEnum.COMPLETED,
        currency: rewardCurrency,
        category: TxnCategoryEnum.GAME_MONTHLY_REWARD,
        description: milestone
          ? `Rewarded ${rewardAmount} ${rewardType} for achieving ${milestone.reason
              ?.replace(/_/g, " ")
              .toLowerCase()} under ${category.name} category in ${getStringMonth(dateInfo.month)} ${dateInfo.year}.`
          : `Rewarded ${rewardAmount} ${rewardType} for ranking ${formatNumberWithCommas(player.rank)}th under ${category.name} category in ${getStringMonth(dateInfo.month)} ${dateInfo.year}.`,
        txnRef,
        metadata: {...dateInfo, catId, mode, policy: "monthly-90-v1"},
        achievementId: achievement?.id || null,
      },
    });

    // Link the transaction back to the achievement (if created)
    if (achievement) {
      await tx.gameAchievement.update({
        where: { id: achievement.id },
        data: { txnId: txn.id },
      });
    }

    return { walletId: wallet.id, transactionId: txn.id };
  });
};

type SettlementPlan = {
  policy: string; snapshot: string; participantCount: number; qualifyingPercent: number; poolPercent: number;
  curve: MonthlyRewardCurve; coinsSpent: string; bonusSpent: string;
};

const rewardMonthlyPlayers = async (item: {catId: string; gameId: string; mode: GameMode}) => {
  const {catId} = item;
  const mode = getGameMode(item.mode);
  const keys = getRankingRewardKeys(catId, mode);
  const period = `${catId}:${item.mode}:${keys.dateInfo.year}:${keys.dateInfo.month}`;
  const planKey = createHash('sha256').update(`monthly-reward-plan:${period}`).digest('hex');
  // Completed periods (including the previous policy) must never be awarded again.
  const settled = await prisma.gameMonthRewardStat.findFirst({where: {catId, mode: item.mode, ...keys.dateInfo}});
  if (settled) return;
  const previous = await prisma.walletOperation.findUnique({where: {id: planKey}});
  let plan = previous?.result as SettlementPlan | undefined;
  if (!plan) {
    if (!await redisClient.exists(keys.rewardMonth)) return;
    // COPY without REPLACE freezes identity, scores and tie order for retries.
    const snapshot = `${keys.rewardMonth}:settlement:monthly-90-v1`;
    await redisClient.copy(keys.rewardMonth, snapshot);
    await redisClient.persist(snapshot);
    const participantCount = await redisClient.zCard(snapshot);
    if (!participantCount) return;
    const tier = monthlyRewardTier(participantCount);
    if (!tier.winners) return;
    const spent = await monthlyGameSpendExact(catId, item.mode, keys.dateInfo.year, keys.dateInfo.month);
    // The ledger's coins field already excludes actual bonus debits. Never deduct
    // an assumed bonus percentage, or subtract the separately recorded bonus twice.
    const actualCoins = new Prisma.Decimal(spent.coins);
    const pool = actualCoins.mul(100).mul(tier.poolPercent).div(100).floor();
    if (!pool.isFinite() || pool.isNegative() || pool.gt(Number.MAX_SAFE_INTEGER)) throw new Error('Monthly reward pool exceeds exact integer capacity');
    const candidate: SettlementPlan = {policy: 'monthly-90-v1', snapshot, participantCount,
      qualifyingPercent: tier.qualifyingPercent, poolPercent: tier.poolPercent,
      curve: createMonthlyRewardCurve(pool.toNumber(), tier.winners),
      coinsSpent: actualCoins.toFixed(2), bonusSpent: new Prisma.Decimal(spent.bonus).toFixed(2)};
    plan = await walletOperation('monthly-reward-plan', period, {policy: 'monthly-90-v1'}, [], async () => candidate);
  }
  if (plan.policy !== 'monthly-90-v1') throw new Error('Unsupported monthly settlement policy');
  if (!await redisClient.exists(plan.snapshot)) throw new Error('Monthly reward snapshot missing; restore it before retrying settlement');
  if (await redisClient.zCard(plan.snapshot) !== plan.participantCount) throw new Error('Monthly reward snapshot changed');
  logger.info({catId, mode: item.mode, period, ...plan}, 'Monthly coin reward plan');
  if (plan.curve.unallocated) logger.warn({period, unallocatedMinorUnits: plan.curve.unallocated}, 'Pool exceeds winner payout capacity; excess remains unpaid');
  let rewardParticipantsScore = 0;
  const batchSize = 200;
  for (let offset = 0; offset < plan.curve.winners; offset += batchSize) {
    const end = Math.min(offset + batchSize, plan.curve.winners) - 1;
    const participants = await redisClient.zRangeWithScores(plan.snapshot, offset, end, {REV: true});
    if (participants.length !== end - offset + 1) throw new Error('Incomplete monthly reward snapshot batch');
    await Promise.all(participants.map(async (member, index) => {
      const rank = offset + index + 1;
      await distributeReward({player: {id: member.value, rank}, catId, mode: item.mode,
        rewardAmount: monthlyRewardAtRank(plan.curve, rank) / 100, dateInfo: keys.dateInfo});
    }));
    rewardParticipantsScore += participants.reduce((sum, member) => sum + member.score, 0);
  }
  const monthStat = await getRedisHashKey<{score: number; numPlayed: number}>(keys.rewardMonthStat);
  await walletOperation('monthly-reward-stat', period, {}, [], async tx => {
    const stat = await tx.gameMonthRewardStat.create({data: {
    catId, mode: item.mode, ...keys.dateInfo,
    totalParticipants: plan.participantCount, rewardParticipants: plan.curve.winners,
    coinsRewardParticipants: plan.curve.winners, topCoinsRewardParticipants: 0, bonusRewardParticipants: 0,
    coinsSpent: plan.coinsSpent, bonusSpent: plan.bonusSpent,
    coinsShareAmount: new Prisma.Decimal(plan.curve.budget).div(100), topCoinsShareAmount: 0, bonusShareAmount: 0,
    rewardParticipantsScore, coinsParticipantsScore: rewardParticipantsScore,
    topCoinsParticipantsScore: 0, bonusParticipantsScore: 0,
    numPlayed: monthStat?.numPlayed ?? 0, totalScore: monthStat?.score ?? 0,
    }});
    return {id: stat.id};
  });
  // Incomplete runs retain their snapshot indefinitely; settled runs no longer
  // need it for replay, so keep only a short inspection window.
  await redisClient.expire(plan.snapshot, 7 * 24 * 60 * 60);
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
