// Resolve path aliases
import "tsconfig-paths/register";
import { retryExecution } from "@/utils/helpers";
import prisma from "@/db";
import { generateUniqueRef, getRewardDateInfo } from "@/utils";
import {
  syncPrismaUserWalletToRedis,
  syncRedisUserWalletToPrisma,
} from "@/services/helper";
import {
  TxnCategoryEnum,
  TxnCurrencyEnum,
  TxnGatewayEnum,
  TxnSourceEnum,
  TxnStatusEnum,
  TxnTypeEnum,
} from "@prisma/client";
import logger from "@/logger";

type RewardGamePlayer = {
  playerId: string;
  year: number;
  totalScore: number;
};

const rewardPlayer = async (player: RewardGamePlayer) => {
  try {
    // get milestone rewards
    const milestone = await prisma.gameMilestone.findFirst({
      where: { name: "GRAND_CHAMP" },
    });
    if (!milestone) return;
    // Check for milestone
    // sync redis user wallet to prisma
    await syncRedisUserWalletToPrisma(player.playerId);
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
          playerId: player.playerId,
          description: `Rewarded ${milestone.reward} ${
            milestone.rewardType
          } & a trophy as the ${milestone.reason
            ?.replace(/_/g, " ")
            .toLowerCase()} of the game in ${player.year}`,
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
            .toLowerCase()} of the game in ${player.year}`,
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
          metadata: { item: player}
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

const rewardYearlyGrandChampion = async () => {
  logger.info(`Reward champ of the game processing...`);
  // get reward date info
  const dateInfo = getRewardDateInfo();
  try {
    const result: {
      playerId: string;
      year: number;
      totalScore: number;
    }[] = await prisma.$queryRaw`
        SELECT
          gms."playerId",
          gms."year",
          SUM(gms."score")::numeric AS "totalScore"
        FROM "GameMonthStat" gms
        WHERE gms."year" = ${2024}
        GROUP BY gms."playerId", gms."year"
        ORDER BY "totalScore" DESC
        LIMIT 1;
      `;

    if (result.length === 0) {
      logger.info(`No player found for grand champ reward game ${dateInfo.yearlyRewardYear}`);
      return;
    }

    await rewardPlayer(result[0]);

    logger.info(`Rewarded grand champ of the game ${dateInfo.yearlyRewardYear}`);
  } catch (error: any) {
    logger.error(error?.message);
  }
};

(async () => {
  try {
    await retryExecution(rewardYearlyGrandChampion, 3);
    logger.info("Reward champ of the game year completed successfully.");
    process.exit(0);
  } catch (error) {
    logger.info("Error: Reward champ of the game year failed after retries.");
    process.exit(1);
  }
})();
