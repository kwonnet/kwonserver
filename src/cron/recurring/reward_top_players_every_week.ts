import { walletOperation, cents } from '@/services/walletLedger';
// Resolve path aliases


import redisClient from "@/redis";
import { PromisePool } from "@supercharge/promise-pool";
import prisma from "@/db";
import { generateUniqueRef, getGameMode, getRankingRewardKeys } from "@/utils";
import {
  getRewardTopRankingPlayers,
  syncPrismaUserWalletToRedis,
  syncRedisUserWalletToPrisma,
} from "@/services/helper";
import {
  GameMode,
  TxnCategoryEnum,
  TxnCurrencyEnum,
  TxnGatewayEnum,
  TxnSourceEnum,
  TxnStatusEnum,
  TxnTypeEnum,
} from "@prisma/client";
import logger from "@/logger";


const rewardCategoryWeeklyPlayers = async (catId: string, _mode: GameMode) => {
  try {
    const mode = getGameMode(_mode)
    const keys = getRankingRewardKeys(catId, mode);
    // check if key exists
    const exists = await redisClient.exists(keys.rewardWeek);
    if (exists === 0) return;
    // get top 3 and reward them
    const players = await getRewardTopRankingPlayers(
      { page: 1, catId, limit: 3, rankingKey: keys.rewardWeek, mode },
      "WEEK"
    );
    // check if 0
    if (players.length === 0) return;
    // get milestone rewards
    const [milestones, category] = await prisma.$transaction([
      prisma.gameMilestone.findMany({ where: { name: "WEEK" } }),
      prisma.gameCategory.findFirst({ where: { id: catId } }),
    ]);
    if (milestones.length === 0 || !category) return;
    // loop through the players and reward them
    await Promise.all(players.map(async (player, index) => {
      const milestone = milestones.find((item) => item.milestone === player.rank);
      // Check for milestone
      if (!milestone) return;
      // sync redis user wallet to prisma
      await syncRedisUserWalletToPrisma(player.id);
      // generate txn ref
      const txnRef = generateUniqueRef();
      // implement transaction
      cents(milestone.reward);
      const result = await walletOperation('reward_top_players_every_week', `${keys.rewardWeek}:${player.id}`, { recipient: player.id }, [player.id], async (tx) => {
        // insert achievement
        const achievement = await tx.gameAchievement.create({
          data: {
            amount: milestone.reward,
            reason: milestone.reason,
            rewardType: milestone.rewardType,
            milestoneId: milestone.id,
            catId,
            playerId: player.id,
            mode: _mode,
            description: `Rewarded ${milestone.reward} ${
              milestone.rewardType
            } & a trophy for achieving ${milestone.reason
              ?.replace(/_/g, " ")
              .toLowerCase()} under ${category.name}`,
            thumbnail: milestone.thumbnail,
            metadata: { txnRef },
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
                coins: { increment: milestone.reward },
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
            category: TxnCategoryEnum.GAME_WEEKLY_REWARD,
            description: `Rewarded ${
              milestone.reward
            } ${rewardType} for achieving ${milestone.reason
              ?.replace(/_/g, " ")
              .toLowerCase()} under ${category.name} category`,
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
    }));
  } catch (error) {
    throw error;
  }
};

const rewardPlayers = async () => {
  try {
    const categories = await prisma.gameCategory.findMany({
      include: { game: true },
    });

    if (categories.length === 0) throw new Error("No game categories");

    // loop through each category game modes and compose each category by mode.
    const result = categories.map(c => {
      return c.game.modes.map(m => {
        return { catId: c.id, gameId: c.gameId, mode: m  }
      })
    }).flat()

    const { results, errors } = await PromisePool.for(result)
      .withConcurrency(5)
      .useCorrespondingResults()
      .process(async ({catId, mode}) => {
        return await rewardCategoryWeeklyPlayers(catId, mode);
      });
    // check errors and dispatch
    if (errors.length > 0) {
      throw new Error("Error: " + errors?.map((i) => i.message).join(", "));
    }
    if (errors.length) throw new Error(errors.map(e => e.message).join(", "));
    return results;
  } catch (error: any) {
    throw error;
  }
};

export async function run() {
  await rewardPlayers();
}
