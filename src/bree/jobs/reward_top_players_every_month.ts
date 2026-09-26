// Resolve path aliases
import "tsconfig-paths/register";
import { formatNumberWithCommas, retryExecution } from "@/utils/helpers";
import redisClient from "@/redis";
import { PromisePool } from "@supercharge/promise-pool";
import prisma from "@/db";
import {
  generateUniqueRef,
  getGameMode,
  getRankingRewardKeys,
  getSpentCoinsKey,
  getStringMonth,
} from "@/utils";
import {
  getCategoryRankingPlayerData,
  getRedisHashKey,
  syncPrismaUserWalletToRedis,
  syncRedisUserWalletToPrisma,
} from "@/services/helper";
import {
  GameMode,
  RewardTypeEnum,
  TxnCategoryEnum,
  TxnCurrencyEnum,
  TxnGatewayEnum,
  TxnSourceEnum,
  TxnStatusEnum,
  TxnTypeEnum,
} from "@prisma/client";
import logger from "@/logger";


// Helper function to calculate reward participants based on count
const getRewardParticipantCounts = (count: number) => {
  if (count <= 50_000) return Math.floor(0.05 * count);
  if (count <= 200_000) return Math.floor(0.07 * count);
  if (count <= 500_000) return Math.floor(0.1 * count);
  if (count <= 1_000_000) return Math.floor(0.12 * count);
  return Math.floor(0.15 * count);
};

// Helper function to calculate reward amounts
const calculateRewardAmounts = (coinsSpent: number) => {
  const shareCoinsAmount = Math.floor(coinsSpent * 0.1);
  return {
    creditShareAmount: Math.floor((shareCoinsAmount * 0.2) / 2.2), // TZX (1 TZX = 2.2 coins)
    coinsShareAmount: Math.floor(shareCoinsAmount * 0.3),
    bonusShareAmount: Math.floor(shareCoinsAmount * 0.5),
  };
};

// Helper function to sum participant scores
const sumParticipantScores = async (
  key: string,
  offset: number,
  limit: number
): Promise<number> => {
  try {
    const exists = await redisClient.exists(key);
    if (!exists) return 0;

    const members = await redisClient.zRangeWithScores(
      key,
      "10000000000000000000",
      "0",
      {
        LIMIT: { offset, count: limit },
        BY: "SCORE",
        REV: true,
      }
    );

    return members.reduce((sum, member) => sum + (member.score || 0), 0);
  } catch (error: any) {
    logger.error(`Error summing participant scores: ${error.message}`);
    throw error;
  }
};


const distributeReward = async ({
  player,
  catId,
  rewardAmount,
  rewardType,
  rewardCurrency,
  dateInfo,
  mode,
}: {
  player: any;
  catId: string;
  rewardAmount: number;
  rewardType: RewardTypeEnum;
  rewardCurrency: TxnCurrencyEnum;
  mode: GameMode;
  dateInfo: { year: number, month: number};
}) => {
  const txnRef = generateUniqueRef();
  // Fetch category and milestone data
  const [category, milestones] = await prisma.$transaction([
    prisma.gameCategory.findFirst({ where: { id: catId } }),
    prisma.gameMilestone.findMany({ where: { name: "MONTH" } }),
  ]);
  if (!category) return;
  // Identify the player's milestone
  const milestone = milestones.find((m) => m.milestone === player.rank);
  // Determine wallet field to update based on reward type
  const walletField =
    rewardType === "CREDIT"
      ? { credit: { increment: rewardAmount } }
      : rewardType === "COINS"
      ? { amount: { increment: rewardAmount } }
      : { bonus: { increment: rewardAmount } };
  // sync redis user wallet to prisma
  await syncRedisUserWalletToPrisma(player.id);
  // perform transaction
  await prisma.$transaction(async (tx) => {
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
        source: rewardType === "COINS" ? TxnSourceEnum.COINS
            : rewardType === "CREDIT" ? TxnSourceEnum.CREDIT 
            : TxnSourceEnum.BONUS,
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
        metadata: dateInfo,
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

    // Sync the wallet back to Redis
    await syncPrismaUserWalletToRedis(player.id, wallet);
  });
};

// Core function to reward players
const rewardMonthlyPlayers = async (item: {
  catId: string;
  gameId: string;
  mode: GameMode
}) => {
  try {
    const {gameId, catId } = item
    const mode = getGameMode(item.mode)
    // get reward ranking keys
    const keys = getRankingRewardKeys(catId, mode);
    // check if exists
    const exists = await redisClient.exists(keys.rewardMonth);
    if (!exists) return;
    // get all participants count
    const participantCount = await redisClient.zCard(keys.rewardMonth);

    logger.info(`Total category participants: ${participantCount}`)

    if (participantCount === 0) return;
    // calculate reward participant count
    const totalRewardParticipants = getRewardParticipantCounts(participantCount);

    logger.info(`Total Reward category participants: ${totalRewardParticipants}`)
    // get number of participant to shared credit, coins and bonus
    const rewardTiers = {
      credit: Math.floor(0.2 * totalRewardParticipants),
      coins: Math.floor(0.3 * totalRewardParticipants),
      bonus: Math.floor(0.5 * totalRewardParticipants),
    };

    logger.info(rewardTiers, "Reward participants tiers")
    // fetch spent coins stats  for this category
    const spentKey = getSpentCoinsKey({ catId, gameId, mode: item.mode });
    const spentAmount = await getRedisHashKey<{
      coins: number;
      bonus: number;
    }>(spentKey);

    if (!spentAmount) return;

    console.log(`Coins spent:`, spentAmount);
    // total bonus / 2.5 as this a bonus
    const totalBonusSpent = Math.floor(spentAmount.bonus / 2.5);

    logger.info(`Total bonus: ${totalBonusSpent}`);

    if (totalBonusSpent > spentAmount.coins) return;
    // deduct total bonus spent form amount of real coins spent
    const totalCoinsSpent = Math.floor(spentAmount.coins - totalBonusSpent);
    logger.info(`totalCoinsSpent after Bonus :`, totalCoinsSpent);
    // get the credit, coins and bonus to spend
    const rewardAmounts = calculateRewardAmounts(totalCoinsSpent);
    logger.info(`rewardAmounts: `, rewardAmounts);
    // calculate reward rank range
    const rankRange = {
      credit: rewardTiers.credit,
      coins: rewardTiers.credit + rewardTiers.coins,
      bonus: rewardTiers.credit + rewardTiers.coins + rewardTiers.bonus
    }
    // get the reward for each tier
    const [
      creditParticipantsScore,
      coinsParticipantsScore,
      bonusParticipantsScore,
    ] = await Promise.all([
      sumParticipantScores(keys.rewardMonth,0, rewardTiers.credit),
      sumParticipantScores(keys.rewardMonth, rankRange.credit, rewardTiers.coins),
      sumParticipantScores(keys.rewardMonth, rankRange.coins, rewardTiers.bonus)
    ])
    if (!creditParticipantsScore || !coinsParticipantsScore || !bonusParticipantsScore) return;
    logger.info({
      creditParticipantsScore,
      coinsParticipantsScore,
      bonusParticipantsScore,
    }, `Reward participants total score: `);
    // 
    const batchSize = 200;
    let page = 1;
    let totalFetched = 0
    while (totalFetched < totalRewardParticipants) {
      const offset = ((page - 1) * batchSize)
      const size = totalRewardParticipants - totalFetched
      const limit = size <  batchSize ? size : batchSize
      // logger.info(`Processing page ${page} with ${limit} participants`);
      const participants = await getCategoryRankingPlayerData(
        {
          offset,
          limit,
          catId,
          rankingKey: keys.rewardMonth,
          mode
        },
        "MONTH"
      );
      // if no participants, break out of the loop
      if (participants.length === 0) break;
      await Promise.all(
        participants.map(async (player) => {
          const rank = player.rank;
          // get reward amount of each participant based on their rank's tier
          const rewardAmount =
            rank <= rankRange.credit
              ? (player.score / creditParticipantsScore) * rewardAmounts.creditShareAmount
              : rank <= rankRange.coins
              ? (player.score / coinsParticipantsScore) * rewardAmounts.coinsShareAmount
              : (player.score / bonusParticipantsScore) * rewardAmounts.bonusShareAmount;
          // get reward type
          const rewardType =
            rank <= rankRange.credit
              ? "CREDIT"
              : rank <= rankRange.coins
              ? "COINS"
              : "BONUS";
          // get reward currency
          const rewardCurrency =
            player.rank <= rankRange.credit
              ? TxnCurrencyEnum.TZX
              : TxnCurrencyEnum.COINS;
          // logger.info(`${player.name }'s rank is ${rank} and score is ${player.score} with reward ${rewardAmount} ${rewardType} - ${rewardCurrency}`);
          // distribute reward to the participants
          await distributeReward({
            player,
            catId,
            mode: item.mode,
            rewardAmount: Math.floor(rewardAmount),
            rewardType,
            rewardCurrency,
            dateInfo: keys.dateInfo
          });
        })
      );
      logger.info(`Batch ${page} rewards processed.`);
      page++;
      totalFetched += participants.length;
    }
    // get game month stats
    const monthStat = await getRedisHashKey<{score: number, numPlayed: number}>(keys.rewardMonthStat)
    // update game reward stats
    await prisma.gameMonthRewardStat.create({
      data: {
        catId,
        ...rewardAmounts,
        totalParticipants: participantCount,
        bonusSpent: spentAmount.bonus,
        coinsSpent: spentAmount.coins,
        rewardParticipantsScore: (creditParticipantsScore +
        coinsParticipantsScore + bonusParticipantsScore),
        creditParticipantsScore,
        coinsParticipantsScore,
        bonusParticipantsScore,
        rewardParticipants: totalRewardParticipants,
        coinsRewardParticipants: rewardTiers.coins,
        bonusRewardParticipants: rewardTiers.bonus,
        creditRewardParticipants: rewardTiers.credit,
        numPlayed: monthStat?.numPlayed ?? 0,
        totalScore: monthStat?.score ?? 0,
        month: keys.dateInfo.month,
        year: keys.dateInfo.year,
        mode: item.mode
      }
    })
    // remove spent coins record
    await redisClient.del(spentKey)
    // log
    logger.info(`${catId} Reward distributted and redis prisma data synced`)
  } catch (error: any) {
    logger.error(`Error rewarding monthly players: ${error.message}`);
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

    return results;
  } catch (error: any) {
    logger.error(`Error rewarding players: ${error.message}`);
    throw error;
  }
};

(async () => {
  try {
    await retryExecution(rewardPlayers, 3);
    logger.info("Syncing Redis Wallet to Prisma completed successfully.");
    process.exit(0);
  } catch (error) {
    logger.info("Error: Syncing Wallet txns to Prisma failed after retries.");
    process.exit(0);
  }
})();
