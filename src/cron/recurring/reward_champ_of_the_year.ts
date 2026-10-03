import { walletOperation, cents } from '@/services/walletLedger';
// Resolve path aliases


import { PromisePool } from "@supercharge/promise-pool";
import prisma from "@/db";
import { generateUniqueRef, getGameMode, getRewardDateInfo } from "@/utils";
import {
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

type RewardGamePlayer = {
  gameId: string;
  gameName: string;
  playerId: string;
  year: number;
  totalScore: number;
  mode: GameMode
};

const rewardPlayer = async (player: RewardGamePlayer) => {
  try {
    // get milestone rewards
    const milestone = await prisma.gameMilestone.findFirst({
      where: { name: "CHAMP" },
    });
    if (!milestone) return;
    // Check for milestone
    // sync redis user wallet to prisma
    await syncRedisUserWalletToPrisma(player.playerId);
    // generate txn ref
    const txnRef = generateUniqueRef();
    // implement transaction
    cents(milestone.reward);
      const result = await walletOperation('reward_champ_of_the_year', `${player.gameId}:${player.mode}:${player.year}:${player.playerId}`, { recipient: player.playerId }, [player.playerId], async (tx) => {
      // insert achievement
      const achievement = await tx.gameAchievement.create({
        data: {
          amount: milestone.reward,
          reason: milestone.reason,
          rewardType: milestone.rewardType,
          milestoneId: milestone.id,
          playerId: player.playerId,
          mode: player.mode,
          description: `Rewarded ${milestone.reward} ${
            milestone.rewardType
          } & a trophy as the ${milestone.reason
            ?.replace(/_/g, " ")
            .toLowerCase()} of ${player.gameName} in ${player.year}`,
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
              coins: { increment: milestone.reward },
            }
          : {
              bonus: { increment: milestone.reward },
            };
      const wallet = await tx.wallet.update({
        where: { userId: player.playerId },
        data: updateData,
      });
      // insert transaction
      const rewardType = milestone.rewardType;
      const currency =
        rewardType === "CREDIT" ? TxnCurrencyEnum.TZX : TxnCurrencyEnum.COINS;
      const txn = await tx.transaction.create({
        data: {
          amount: milestone.reward,
          currency: currency,
          category: TxnCategoryEnum.GAME_YEARLY_REWARD,
          description: `Rewarded ${
            milestone.reward
          } ${rewardType} as the ${milestone.reason
            ?.replace(/_/g, " ")
            .toLowerCase()} of ${player.gameName} in ${player.year}`,
          gateway: TxnGatewayEnum.WALLET,
          source:
            rewardType === "CREDIT"
              ? TxnSourceEnum.CREDIT
              : rewardType === "COINS"
              ? TxnSourceEnum.COINS
              : TxnSourceEnum.BONUS,
          type: TxnTypeEnum.CREDIT,
          status: TxnStatusEnum.COMPLETED,
          achievementId: achievement.id,
          txnRef,
          userId: player.playerId,
          recipientId: player.playerId,
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
    await syncPrismaUserWalletToRedis(player.playerId, result.wallet);
  } catch (error) {
    throw error;
  }
};

const rewardYearlyChampion = async (gameId: string, mode: GameMode) => {
  
  logger.info(`Reward champ of the game processing...`);
  // get reward date info
  const dateInfo = getRewardDateInfo();
  try {
    const result: {
      gameId: string;
      gameName: string;
      year: number;
      playerId: string;
      totalScore: number;
      mode: GameMode
    }[] = await prisma.$queryRaw`
    SELECT
      gc."gameId",
      g."name" AS "gameName",
      gms."year",
      gms."playerId",
      gms."mode",
      SUM(gms."score")::numeric AS "totalScore"
    FROM "GameMonthStat" gms
    INNER JOIN "GameCategory" gc ON gc."id" = gms."catId"
    INNER JOIN "Game" g ON g."id" = gc."gameId"
    WHERE gc."gameId" = ${gameId} AND gms."year" = ${dateInfo.yearlyRewardYear} AND gms."mode" = ${mode}
    GROUP BY gc."gameId", g."name", gms."playerId", gms."year", gms."mode"
    ORDER BY "totalScore" DESC
    LIMIT 1;
  `;

    if (result.length === 0) {
      logger.info(
        `No player found for grand champ reward game ${dateInfo.yearlyRewardYear}`
      );
      return;
    }

    await rewardPlayer(result[0]);

    logger.info(`Rewarded champ of the game ${gameId}`);
    
  } catch (error: any) {
    logger.error(error?.message);
    throw error;
  }
};

// Main reward execution
const rewardPlayers = async () => {
  try {
    const games = await prisma.game.findMany();

    if (games.length === 0) throw new Error("No game categories available");

    // loop through each game modes and compose each by mode.
    const result = games.map(c => {
      return c.modes.map(m => {
        return { id: c.id, mode: m  }
      })
    }).flat()

    const { results, errors } = await PromisePool.for(result)
      .withConcurrency(2)
      .process(async ({ id, mode }) => {
        await rewardYearlyChampion(id, mode);
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
