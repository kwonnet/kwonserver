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
const redis_1 = __importDefault(require("@/redis"));
const promise_pool_1 = require("@supercharge/promise-pool");
const db_1 = __importDefault(require("@/db"));
const utils_1 = require("@/utils");
const helper_1 = require("@/services/helper");
const client_1 = require("@prisma/client");
const logger_1 = __importDefault(require("@/logger"));
// Helper function to calculate reward participants based on count
const getRewardParticipantCounts = (count) => {
    if (count <= 50000)
        return Math.floor(0.05 * count);
    if (count <= 200000)
        return Math.floor(0.07 * count);
    if (count <= 500000)
        return Math.floor(0.1 * count);
    if (count <= 1000000)
        return Math.floor(0.12 * count);
    return Math.floor(0.15 * count);
};
// Helper function to calculate reward amounts
const calculateRewardAmounts = (coinsSpent) => {
    const shareCoinsAmount = Math.floor(coinsSpent * 0.1);
    return {
        creditShareAmount: Math.floor((shareCoinsAmount * 0.2) / 2.2), // TZX (1 TZX = 2.2 coins)
        coinsShareAmount: Math.floor(shareCoinsAmount * 0.3),
        bonusShareAmount: Math.floor(shareCoinsAmount * 0.5),
    };
};
// Helper function to sum participant scores
const sumParticipantScores = (key, offset, limit) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const exists = yield redis_1.default.exists(key);
        if (!exists)
            return 0;
        const members = yield redis_1.default.zRangeWithScores(key, "10000000000000000000", "0", {
            LIMIT: { offset, count: limit },
            BY: "SCORE",
            REV: true,
        });
        return members.reduce((sum, member) => sum + (member.score || 0), 0);
    }
    catch (error) {
        logger_1.default.error(`Error summing participant scores: ${error.message}`);
        throw error;
    }
});
const distributeReward = (_a) => __awaiter(void 0, [_a], void 0, function* ({ player, catId, rewardAmount, rewardType, rewardCurrency, dateInfo, mode, }) {
    const txnRef = (0, utils_1.generateUniqueRef)();
    // Fetch category and milestone data
    const [category, milestones] = yield db_1.default.$transaction([
        db_1.default.gameCategory.findFirst({ where: { id: catId } }),
        db_1.default.gameMilestone.findMany({ where: { name: "MONTH" } }),
    ]);
    if (!category)
        return;
    // Identify the player's milestone
    const milestone = milestones.find((m) => m.milestone === player.rank);
    // Determine wallet field to update based on reward type
    const walletField = rewardType === "CREDIT"
        ? { credit: { increment: rewardAmount } }
        : rewardType === "COINS"
            ? { amount: { increment: rewardAmount } }
            : { bonus: { increment: rewardAmount } };
    // sync redis user wallet to prisma
    yield (0, helper_1.syncRedisUserWalletToPrisma)(player.id);
    // perform transaction
    yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        // Create `gameAchievement` record if a milestone exists
        let achievement;
        if (milestone) {
            achievement = yield tx.gameAchievement.create({
                data: {
                    reason: milestone.reason,
                    playerId: player.id,
                    catId,
                    mode,
                    amount: rewardAmount,
                    rewardType,
                    milestoneId: milestone.id,
                    description: `Rewarded ${rewardAmount} ${rewardType} and a trophy for achieving ${(_a = milestone.reason) === null || _a === void 0 ? void 0 : _a.replace(/_/g, " ").toLowerCase()} under ${category.name} category in ${(0, utils_1.getStringMonth)(dateInfo.month)} ${dateInfo.year}.`,
                    thumbnail: milestone.thumbnail,
                    metadata: Object.assign({ txnRef }, dateInfo),
                },
            });
        }
        // Update the player's wallet
        const wallet = yield tx.wallet.update({
            where: { userId: player.id },
            data: walletField,
        });
        // Create transaction record
        const txn = yield tx.transaction.create({
            data: {
                userId: player.id,
                recipientId: player.id,
                walletId: wallet.id,
                amount: rewardAmount,
                gateway: client_1.TxnGatewayEnum.WALLET,
                source: rewardType === "COINS" ? client_1.TxnSourceEnum.COINS
                    : rewardType === "CREDIT" ? client_1.TxnSourceEnum.CREDIT
                        : client_1.TxnSourceEnum.BONUS,
                type: client_1.TxnTypeEnum.CREDIT,
                status: client_1.TxnStatusEnum.COMPLETED,
                currency: rewardCurrency,
                category: client_1.TxnCategoryEnum.GAME_MONTHLY_REWARD,
                description: milestone
                    ? `Rewarded ${rewardAmount} ${rewardType} for achieving ${(_b = milestone.reason) === null || _b === void 0 ? void 0 : _b.replace(/_/g, " ").toLowerCase()} under ${category.name} category in ${(0, utils_1.getStringMonth)(dateInfo.month)} ${dateInfo.year}.`
                    : `Rewarded ${rewardAmount} ${rewardType} for ranking ${(0, helpers_1.formatNumberWithCommas)(player.rank)}th under ${category.name} category in ${(0, utils_1.getStringMonth)(dateInfo.month)} ${dateInfo.year}.`,
                txnRef,
                metadata: dateInfo,
                achievementId: (achievement === null || achievement === void 0 ? void 0 : achievement.id) || null,
            },
        });
        // Link the transaction back to the achievement (if created)
        if (achievement) {
            yield tx.gameAchievement.update({
                where: { id: achievement.id },
                data: { txnId: txn.id },
            });
        }
        // Sync the wallet back to Redis
        yield (0, helper_1.syncPrismaUserWalletToRedis)(player.id, wallet);
    }));
});
// Core function to reward players
const rewardMonthlyPlayers = (item) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { gameId, catId } = item;
        const mode = (0, utils_1.getGameMode)(item.mode);
        // get reward ranking keys
        const keys = (0, utils_1.getRankingRewardKeys)(catId, mode);
        // check if exists
        const exists = yield redis_1.default.exists(keys.rewardMonth);
        if (!exists)
            return;
        // get all participants count
        const participantCount = yield redis_1.default.zCard(keys.rewardMonth);
        logger_1.default.info(`Total category participants: ${participantCount}`);
        if (participantCount === 0)
            return;
        // calculate reward participant count
        const totalRewardParticipants = getRewardParticipantCounts(participantCount);
        logger_1.default.info(`Total Reward category participants: ${totalRewardParticipants}`);
        // get number of participant to shared credit, coins and bonus
        const rewardTiers = {
            credit: Math.floor(0.2 * totalRewardParticipants),
            coins: Math.floor(0.3 * totalRewardParticipants),
            bonus: Math.floor(0.5 * totalRewardParticipants),
        };
        logger_1.default.info(rewardTiers, "Reward participants tiers");
        // fetch spent coins stats  for this category
        const spentKey = (0, utils_1.getSpentCoinsKey)({ catId, gameId, mode: item.mode });
        const spentAmount = yield (0, helper_1.getRedisHashKey)(spentKey);
        if (!spentAmount)
            return;
        console.log(`Coins spent:`, spentAmount);
        // total bonus / 2.5 as this a bonus
        const totalBonusSpent = Math.floor(spentAmount.bonus / 2.5);
        logger_1.default.info(`Total bonus: ${totalBonusSpent}`);
        if (totalBonusSpent > spentAmount.coins)
            return;
        // deduct total bonus spent form amount of real coins spent
        const totalCoinsSpent = Math.floor(spentAmount.coins - totalBonusSpent);
        logger_1.default.info(`totalCoinsSpent after Bonus :`, totalCoinsSpent);
        // get the credit, coins and bonus to spend
        const rewardAmounts = calculateRewardAmounts(totalCoinsSpent);
        logger_1.default.info(`rewardAmounts: `, rewardAmounts);
        // calculate reward rank range
        const rankRange = {
            credit: rewardTiers.credit,
            coins: rewardTiers.credit + rewardTiers.coins,
            bonus: rewardTiers.credit + rewardTiers.coins + rewardTiers.bonus
        };
        // get the reward for each tier
        const [creditParticipantsScore, coinsParticipantsScore, bonusParticipantsScore,] = yield Promise.all([
            sumParticipantScores(keys.rewardMonth, 0, rewardTiers.credit),
            sumParticipantScores(keys.rewardMonth, rankRange.credit, rewardTiers.coins),
            sumParticipantScores(keys.rewardMonth, rankRange.coins, rewardTiers.bonus)
        ]);
        if (!creditParticipantsScore || !coinsParticipantsScore || !bonusParticipantsScore)
            return;
        logger_1.default.info({
            creditParticipantsScore,
            coinsParticipantsScore,
            bonusParticipantsScore,
        }, `Reward participants total score: `);
        // 
        const batchSize = 200;
        let page = 1;
        let totalFetched = 0;
        while (totalFetched < totalRewardParticipants) {
            const offset = ((page - 1) * batchSize);
            const size = totalRewardParticipants - totalFetched;
            const limit = size < batchSize ? size : batchSize;
            // logger.info(`Processing page ${page} with ${limit} participants`);
            const participants = yield (0, helper_1.getCategoryRankingPlayerData)({
                offset,
                limit,
                catId,
                rankingKey: keys.rewardMonth,
                mode
            }, "MONTH");
            // if no participants, break out of the loop
            if (participants.length === 0)
                break;
            yield Promise.all(participants.map((player) => __awaiter(void 0, void 0, void 0, function* () {
                const rank = player.rank;
                // get reward amount of each participant based on their rank's tier
                const rewardAmount = rank <= rankRange.credit
                    ? (player.score / creditParticipantsScore) * rewardAmounts.creditShareAmount
                    : rank <= rankRange.coins
                        ? (player.score / coinsParticipantsScore) * rewardAmounts.coinsShareAmount
                        : (player.score / bonusParticipantsScore) * rewardAmounts.bonusShareAmount;
                // get reward type
                const rewardType = rank <= rankRange.credit
                    ? "CREDIT"
                    : rank <= rankRange.coins
                        ? "COINS"
                        : "BONUS";
                // get reward currency
                const rewardCurrency = player.rank <= rankRange.credit
                    ? client_1.TxnCurrencyEnum.TZX
                    : client_1.TxnCurrencyEnum.COINS;
                // logger.info(`${player.name }'s rank is ${rank} and score is ${player.score} with reward ${rewardAmount} ${rewardType} - ${rewardCurrency}`);
                // distribute reward to the participants
                yield distributeReward({
                    player,
                    catId,
                    mode: item.mode,
                    rewardAmount: Math.floor(rewardAmount),
                    rewardType,
                    rewardCurrency,
                    dateInfo: keys.dateInfo
                });
            })));
            logger_1.default.info(`Batch ${page} rewards processed.`);
            page++;
            totalFetched += participants.length;
        }
        // get game month stats
        const monthStat = yield (0, helper_1.getRedisHashKey)(keys.rewardMonthStat);
        // update game reward stats
        yield db_1.default.gameMonthRewardStat.create({
            data: Object.assign(Object.assign({ catId }, rewardAmounts), { totalParticipants: participantCount, bonusSpent: spentAmount.bonus, coinsSpent: spentAmount.coins, rewardParticipantsScore: (creditParticipantsScore +
                    coinsParticipantsScore + bonusParticipantsScore), creditParticipantsScore,
                coinsParticipantsScore,
                bonusParticipantsScore, rewardParticipants: totalRewardParticipants, coinsRewardParticipants: rewardTiers.coins, bonusRewardParticipants: rewardTiers.bonus, creditRewardParticipants: rewardTiers.credit, numPlayed: (_a = monthStat === null || monthStat === void 0 ? void 0 : monthStat.numPlayed) !== null && _a !== void 0 ? _a : 0, totalScore: (_b = monthStat === null || monthStat === void 0 ? void 0 : monthStat.score) !== null && _b !== void 0 ? _b : 0, month: keys.dateInfo.month, year: keys.dateInfo.year, mode: item.mode })
        });
        // remove spent coins record
        yield redis_1.default.del(spentKey);
        // log
        logger_1.default.info(`${catId} Reward distributted and redis prisma data synced`);
    }
    catch (error) {
        logger_1.default.error(`Error rewarding monthly players: ${error.message}`);
        throw error;
    }
});
// Main reward execution
const rewardPlayers = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const categories = yield db_1.default.gameCategory.findMany({
            include: { game: true },
        });
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
            .process((_a) => __awaiter(void 0, [_a], void 0, function* ({ catId, gameId, mode }) {
            yield rewardMonthlyPlayers({ catId, gameId, mode });
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
