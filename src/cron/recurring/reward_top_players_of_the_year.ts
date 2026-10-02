// Resolve path aliases

import { formatNumberWithCommas } from "@/utils/helpers";
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

const rewardPlayer = async (player: { 
  catId: string,
  id: string,
  totalscore: number,
  rank: number,
  year: number,
  mode: GameMode
}) => {
  try {
    // get milestone rewards
    const [milestones, category] = await prisma.$transaction([
      prisma.gameMilestone.findMany({ where: { name: "YEAR" } }),
      prisma.gameCategory.findFirst({ where: { id: player.catId }, include: { game: true} }),
    ]);
    if (milestones.length === 0 || !category) return;
    // loop through the players and reward them
      const milestone = milestones.find((item) => item.milestone === player.rank);
      // Check for milestone
      if (!milestone) return;
      // sync redis user wallet to prisma
      await syncRedisUserWalletToPrisma(player.id);
      // generate txn ref
      const txnRef = generateUniqueRef();
      // implement transaction
      const result = await prisma.$transaction(async (tx) => {
        // insert achievement
        const achievement = await tx.gameAchievement.create({
          data: {
            amount: milestone.reward,
            reason: milestone.reason,
            rewardType: milestone.rewardType,
            milestoneId: milestone.id,
            catId: player.catId,
            playerId: player.id,
            mode: player.mode,
            description: `Rewarded ${milestone.reward} ${
              milestone.rewardType
            } & a trophy for achieving ${milestone.reason
              ?.replace(/_/g, " ")
              .toLowerCase()} under ${category.name} in ${player.year}`,
            thumbnail: milestone.thumbnail,
            metadata: { txnRef, item: player },
          },
        });
        // credit user wallet
        const updateData =
          milestone.rewardType === "CREDIT"
            ? {
                credit: { increment: milestone.reward },
              }
            : milestone.rewardType === "COINS"
            ? {
                amount: { increment: milestone.reward },
              }
            : {
                bonus: { increment: milestone.reward },
              };
        const wallet = await tx.wallet.update({
          where: { userId: player.id },
          data: updateData,
        });
        // insert transaction
        const rewardType = milestone.rewardType
        const currency =
          rewardType === "CREDIT"
            ? TxnCurrencyEnum.TZX
            : TxnCurrencyEnum.COINS;
        const txn = await tx.transaction.create({
          data: {
            amount: milestone.reward,
            currency: currency,
            category: TxnCategoryEnum.GAME_YEARLY_REWARD,
            description: `Rewarded ${
              milestone.reward
            } ${rewardType} for achieving ${milestone.reason
              ?.replace(/_/g, " ")
              .toLowerCase()} under ${category.name} in ${player.year}`,
            gateway: TxnGatewayEnum.WALLET,
            source: rewardType === "CREDIT" ? TxnSourceEnum.CREDIT : rewardType === "COINS" ?
              TxnSourceEnum.COINS : TxnSourceEnum.BONUS,
            type: TxnTypeEnum.CREDIT,
            status: TxnStatusEnum.COMPLETED,
            achievementId: achievement.id,
            txnRef,
            userId: player.id,
            recipientId: player.id,
            walletId: wallet?.id,
            metadata: { item: player },
          },
        });
        // update transaction
        await tx.gameAchievement.update({
          where: { id: achievement.id },
          data: { txnId: txn.id },
        });
        // return
        return { achievement, wallet };
      });
      // sync prisma wallet to redis
      await syncPrismaUserWalletToRedis(player.id, result.wallet);
  } catch (error) {
    throw error;
  }
};

const rewardYearlyPlayers = async(catId: string, _mode: GameMode ) => {
  const mode = getGameMode(_mode)
  logger.info(`Processing... Top 3 from each category by score`);
  // get reward ranking keys
  const keys = getRankingRewardKeys(catId, mode);
  try {
    const topThreePlayers: { 
      catId: string,
      playerId: string,
      totalscore: number,
      rankIncategory: number }[] = await prisma.$queryRaw`
      WITH PlayerCategoryScores AS (
        SELECT
          gms."catId",
          gms."playerId",
          SUM(gms."score") AS totalScore
        FROM "GameMonthStat" gms
        WHERE gms."year" = ${keys.dateInfo.year} AND gms."catId" = ${catId}
        GROUP BY gms."catId", gms."playerId"
      ),
      RankedPlayers AS (
        SELECT
          pcs."catId",
          pcs."playerId",
          pcs.totalScore,
          ROW_NUMBER() OVER (PARTITION BY pcs."catId" ORDER BY pcs.totalScore DESC) AS rankInCategory
        FROM PlayerCategoryScores pcs
      )
      SELECT
        rp."catId",
        rp."playerId",
        rp.totalScore,
        rp.rankInCategory
      FROM RankedPlayers rp
      WHERE rp.rankInCategory <= 3
      ORDER BY rp."catId", rp.rankInCategory;
    `;
    const formattedResults = topThreePlayers.map((player, index) => ({
      catId: player.catId,
      id: player.playerId,
      totalscore: Number(player.totalscore), // Ensure it's within safe range
      rank: index + 1,
      year: keys.dateInfo.year,
      mode: _mode
    }));

    console.log(formattedResults)

    await Promise.all(formattedResults.map((result) =>rewardPlayer(result)))
    logger.info(`Rewarded Top 3 players from category by score`);
  } catch (error: any) {
    logger.error(error?.message);
    throw error;
  }
}

// Main reward execution
const rewardPlayers = async () => {
  try {
    const categories = await prisma.gameCategory.findMany({include: { game: true}});

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
      .process(async ({ catId, mode }) => {
        await rewardYearlyPlayers(catId, mode);
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

export async function run() {
  await rewardPlayers();
}
