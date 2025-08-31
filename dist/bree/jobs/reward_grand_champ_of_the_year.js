"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Resolve path aliases
require("tsconfig-paths/register");
const helpers_1 = require("@/utils/helpers");
const db_1 = __importDefault(require("@/db"));
const utils_1 = require("@/utils");
const helper_1 = require("@/services/helper");
const client_1 = require("@prisma/client");
const logger_1 = __importDefault(require("@/logger"));
const rewardPlayer = (player) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // get milestone rewards
        const milestone = yield db_1.default.gameMilestone.findFirst({
            where: { name: "GRAND_CHAMP" },
        });
        if (!milestone)
            return;
        // Check for milestone
        // sync redis user wallet to prisma
        yield (0, helper_1.syncRedisUserWalletToPrisma)(player.playerId);
        // generate txn ref
        const txnRef = (0, utils_1.generateUniqueRef)();
        // implement transaction
        const result = yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b;
            // insert achievement
            const achievement = yield tx.gameAchievement.create({
                data: {
                    amount: milestone.reward,
                    reason: milestone.reason,
                    rewardType: milestone.rewardType,
                    milestoneId: milestone.id,
                    playerId: player.playerId,
                    description: `Rewarded ${milestone.reward} ${milestone.rewardType} & a trophy as the ${(_a = milestone.reason) === null || _a === void 0 ? void 0 : _a.replace(/_/g, " ").toLowerCase()} of the game in ${player.year}`,
                    thumbnail: milestone.thumbnail,
                    metadata: { txnRef, item: player },
                },
            });
            // credit user wallet
            const updateData = milestone.rewardType === "CREDIT"
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
            const wallet = yield tx.wallet.update({
                where: { userId: player.playerId },
                data: updateData,
            });
            // insert transaction
            const rewardType = milestone.rewardType;
            const currency = rewardType === "CREDIT" ? client_1.TxnCurrencyEnum.TZX : client_1.TxnCurrencyEnum.COINS;
            const txn = yield tx.transaction.create({
                data: {
                    amount: milestone.reward,
                    currency: currency,
                    category: client_1.TxnCategoryEnum.GAME_YEARLY_REWARD,
                    description: `Rewarded ${milestone.reward} ${rewardType} as the ${(_b = milestone.reason) === null || _b === void 0 ? void 0 : _b.replace(/_/g, " ").toLowerCase()} of the game in ${player.year}`,
                    gateway: client_1.TxnGatewayEnum.WALLET,
                    source: rewardType === "CREDIT"
                        ? client_1.TxnSourceEnum.CREDIT
                        : rewardType === "COINS"
                            ? client_1.TxnSourceEnum.COINS
                            : client_1.TxnSourceEnum.BONUS,
                    type: client_1.TxnTypeEnum.CREDIT,
                    status: client_1.TxnStatusEnum.COMPLETED,
                    achievementId: achievement.id,
                    txnRef,
                    userId: player.playerId,
                    recipientId: player.playerId,
                    walletId: wallet === null || wallet === void 0 ? void 0 : wallet.id,
                    metadata: { item: player }
                },
            });
            // update transaction
            yield tx.gameAchievement.update({
                where: { id: achievement.id },
                data: { txnId: txn.id },
            });
            // return
            return { achievement, wallet };
        }));
        // sync prisma wallet to redis
        yield (0, helper_1.syncPrismaUserWalletToRedis)(player.playerId, result.wallet);
    }
    catch (error) {
        throw error;
    }
});
const rewardYearlyGrandChampion = () => __awaiter(void 0, void 0, void 0, function* () {
    logger_1.default.info(`Reward champ of the game processing...`);
    // get reward date info
    const dateInfo = (0, utils_1.getRewardDateInfo)();
    try {
        const result = yield db_1.default.$queryRaw `
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
            logger_1.default.info(`No player found for grand champ reward game ${dateInfo.yearlyRewardYear}`);
            return;
        }
        yield rewardPlayer(result[0]);
        logger_1.default.info(`Rewarded grand champ of the game ${dateInfo.yearlyRewardYear}`);
    }
    catch (error) {
        logger_1.default.error(error === null || error === void 0 ? void 0 : error.message);
    }
});
(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, helpers_1.retryExecution)(rewardYearlyGrandChampion, 3);
        logger_1.default.info("Reward champ of the game year completed successfully.");
        process.exit(0);
    }
    catch (error) {
        logger_1.default.info("Error: Reward champ of the game year failed after retries.");
        process.exit(1);
    }
}))();
