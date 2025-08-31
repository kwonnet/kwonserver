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
        const [milestones, category] = yield db_1.default.$transaction([
            db_1.default.gameMilestone.findMany({ where: { name: "YEAR" } }),
            db_1.default.gameCategory.findFirst({ where: { id: player.catId }, include: { game: true } }),
        ]);
        if (milestones.length === 0 || !category)
            return;
        // loop through the players and reward them
        const milestone = milestones.find((item) => item.milestone === player.rank);
        // Check for milestone
        if (!milestone)
            return;
        // sync redis user wallet to prisma
        yield (0, helper_1.syncRedisUserWalletToPrisma)(player.id);
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
                    catId: player.catId,
                    playerId: player.id,
                    mode: player.mode,
                    description: `Rewarded ${milestone.reward} ${milestone.rewardType} & a trophy for achieving ${(_a = milestone.reason) === null || _a === void 0 ? void 0 : _a.replace(/_/g, " ").toLowerCase()} under ${category.name} in ${player.year}`,
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
                where: { userId: player.id },
                data: updateData,
            });
            // insert transaction
            const rewardType = milestone.rewardType;
            const currency = rewardType === "CREDIT"
                ? client_1.TxnCurrencyEnum.TZX
                : client_1.TxnCurrencyEnum.COINS;
            const txn = yield tx.transaction.create({
                data: {
                    amount: milestone.reward,
                    currency: currency,
                    category: client_1.TxnCategoryEnum.GAME_YEARLY_REWARD,
                    description: `Rewarded ${milestone.reward} ${rewardType} for achieving ${(_b = milestone.reason) === null || _b === void 0 ? void 0 : _b.replace(/_/g, " ").toLowerCase()} under ${category.name} in ${player.year}`,
                    gateway: client_1.TxnGatewayEnum.WALLET,
                    source: rewardType === "CREDIT" ? client_1.TxnSourceEnum.CREDIT : rewardType === "COINS" ?
                        client_1.TxnSourceEnum.COINS : client_1.TxnSourceEnum.BONUS,
                    type: client_1.TxnTypeEnum.CREDIT,
                    status: client_1.TxnStatusEnum.COMPLETED,
                    achievementId: achievement.id,
                    txnRef,
                    userId: player.id,
                    recipientId: player.id,
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
        yield (0, helper_1.syncPrismaUserWalletToRedis)(player.id, result.wallet);
    }
    catch (error) {
        throw error;
    }
});
const rewardYearlyPlayers = (catId, _mode) => __awaiter(void 0, void 0, void 0, function* () {
    const mode = (0, utils_1.getGameMode)(_mode);
    logger_1.default.info(`Processing... Top 3 from each category by score`);
    // get reward ranking keys
    const keys = (0, utils_1.getRankingRewardKeys)(catId, mode);
    try {
        const topThreePlayers = yield db_1.default.$queryRaw `
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
        console.log(formattedResults);
        yield Promise.all(formattedResults.map((result) => rewardPlayer(result)));
        logger_1.default.info(`Rewarded Top 3 players from category by score`);
    }
    catch (error) {
        logger_1.default.error(error === null || error === void 0 ? void 0 : error.message);
    }
});
// Main reward execution
const rewardPlayers = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const categories = yield db_1.default.gameCategory.findMany({ include: { game: true } });
        if (categories.length === 0)
            throw new Error("No game categories available");
        // loop through each category game modes and compose each category by mode.
        const result = categories.map(c => {
            return c.game.modes.map(m => {
                return { catId: c.id, gameId: c.gameId, mode: m };
            });
        }).flat();
        const { results, errors } = yield promise_pool_1.PromisePool.for(result)
            .withConcurrency(2)
            .process((_a) => __awaiter(void 0, [_a], void 0, function* ({ catId, mode }) {
            yield rewardYearlyPlayers(catId, mode);
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
        logger_1.default.info("Syncing Redis Wallet to Prisma completed successfully.");
        process.exit(0);
    }
    catch (error) {
        logger_1.default.info("Error: Syncing Wallet txns to Prisma failed after retries.");
        process.exit(1);
    }
}))();
