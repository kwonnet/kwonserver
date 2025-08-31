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
const promise_pool_1 = require("@supercharge/promise-pool");
const db_1 = __importDefault(require("@/db"));
const utils_1 = require("@/utils");
const helper_1 = require("@/services/helper");
const client_1 = require("@prisma/client");
const logger_1 = __importDefault(require("@/logger"));
const rewardPlayer = (player) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // get milestone rewards
        const milestone = yield db_1.default.gameMilestone.findFirst({
            where: { name: "CHAMP" },
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
                    mode: player.mode,
                    description: `Rewarded ${milestone.reward} ${milestone.rewardType} & a trophy as the ${(_a = milestone.reason) === null || _a === void 0 ? void 0 : _a.replace(/_/g, " ").toLowerCase()} of ${player.gameName} in ${player.year}`,
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
                    description: `Rewarded ${milestone.reward} ${rewardType} as the ${(_b = milestone.reason) === null || _b === void 0 ? void 0 : _b.replace(/_/g, " ").toLowerCase()} of ${player.gameName} in ${player.year}`,
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
                    metadata: { item: player },
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
const rewardYearlyChampion = (gameId, mode) => __awaiter(void 0, void 0, void 0, function* () {
    logger_1.default.info(`Reward champ of the game processing...`);
    // get reward date info
    const dateInfo = (0, utils_1.getRewardDateInfo)();
    try {
        const result = yield db_1.default.$queryRaw `
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
    WHERE gc."gameId" = ${gameId} AND gms."year" = ${2024} AND gms."mode" = ${mode}
    GROUP BY gc."gameId", g."name", gms."playerId", gms."year", gms."mode"
    ORDER BY "totalScore" DESC
    LIMIT 1;
  `;
        if (result.length === 0) {
            logger_1.default.info(`No player found for grand champ reward game ${dateInfo.yearlyRewardYear}`);
            return;
        }
        yield rewardPlayer(result[0]);
        logger_1.default.info(`Rewarded champ of the game ${gameId}`);
    }
    catch (error) {
        logger_1.default.error(error === null || error === void 0 ? void 0 : error.message);
    }
});
// Main reward execution
const rewardPlayers = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const games = yield db_1.default.game.findMany();
        if (games.length === 0)
            throw new Error("No game categories available");
        // loop through each game modes and compose each by mode.
        const result = games.map(c => {
            return c.modes.map(m => {
                return { id: c.id, mode: m };
            });
        }).flat();
        const { results, errors } = yield promise_pool_1.PromisePool.for(result)
            .withConcurrency(2)
            .process((_a) => __awaiter(void 0, [_a], void 0, function* ({ id, mode }) {
            yield rewardYearlyChampion(id, mode);
        }));
        if (errors.length > 0) {
            logger_1.default.error(`Errors during rewards processing: ${errors
                .map((e) => e.message)
                .join(", ")}`);
        }
        return results;
    }
    catch (error) {
        logger_1.default.error(`Error rewarding players: ${error.message}`);
        throw error;
    }
});
(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, helpers_1.retryExecution)(rewardPlayers, 3);
        logger_1.default.info("Reward champ of the game year completed successfully.");
        process.exit(0);
    }
    catch (error) {
        logger_1.default.info("Error: Reward champ of the game year failed after retries.");
        process.exit(1);
    }
}))();
