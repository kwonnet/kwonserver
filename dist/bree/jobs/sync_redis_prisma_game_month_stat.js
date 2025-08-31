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
const logger_1 = __importDefault(require("@/logger"));
const helper_1 = require("@/services/helper");
function clearMonthStatsKeys(keys) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // clear monthly game data stats redis keys
            yield Promise.all(Object.values(keys).map(val => redis_1.default.del(val)));
            logger_1.default.info('Cleared game month stats redis keys successfuly');
        }
        catch (error) {
            logger_1.default.info('Error: Clearing game month stats redis keys failed.', error === null || error === void 0 ? void 0 : error.message);
        }
    });
}
function clearRedisKeysByPattern(pattern) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // clear players stats redis keys
            let cursor = 0; // Initial cursor
            let keyCounts = 0;
            do {
                // Use SCAN to fetch a batch of keys
                const { cursor: newCursor, keys } = yield redis_1.default.scan(cursor, { COUNT: 50000, MATCH: pattern });
                cursor = newCursor;
                keyCounts += keys.length;
                logger_1.default.info(`cursor: ${cursor}`);
                logger_1.default.info(`First key : ${keys[0]}`);
                logger_1.default.info(`Found ${keys.length} keys in this batch`);
                if (keys.length > 0) {
                    yield Promise.all(keys.map((key) => redis_1.default.del(key)));
                    logger_1.default.info(`Deleted ${keys.length} keys in this batch`);
                }
            } while (cursor !== 0); // SCAN stops when cursor is back to '0'
            logger_1.default.info(`All matching ${(0, helpers_1.formatNumberWithCommas)(keyCounts)} keys have been deleted.`);
        }
        catch (error) {
            logger_1.default.info('Error: Deleting players month stats failed.', error === null || error === void 0 ? void 0 : error.message);
        }
    });
}
const syncMonthlyPlayerStats = (item) => __awaiter(void 0, void 0, void 0, function* () {
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
        const batchSize = 1000;
        let page = 1;
        let totalFetched = 0;
        while (totalFetched < participantCount) {
            const offset = ((page - 1) * batchSize);
            const size = participantCount - totalFetched;
            const limit = size < batchSize ? size : batchSize;
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
            const data = participants.map((player) => {
                return {
                    catId,
                    playerId: player.id,
                    rank: player.rank,
                    score: player.score,
                    numPlayed: player.numPlayed,
                    year: keys.dateInfo.year,
                    month: keys.dateInfo.month,
                    mode: item.mode
                };
            });
            // create prisma data
            yield db_1.default.gameMonthStat.createMany({ data, skipDuplicates: true });
            logger_1.default.info(`Batch ${page} monthly game players stats  synced successfully.`);
            page++;
            totalFetched += participants.length;
        }
        // clear month game data, month stat & spentCoins
        yield clearMonthStatsKeys({
            rewardMonth: keys.rewardMonth,
            stat: keys.rewardMonthStat,
            spentCoins: (0, utils_1.getSpentCoinsKey)({ catId, gameId, mode: item.mode, dateInfo: { year: keys.dateInfo.year, month: keys.dateInfo.month } })
        });
        // clear players stats
        yield clearRedisKeysByPattern(`player:*:cat:${catId}:mode:${mode}:${keys.dateInfo.year}:${keys.dateInfo.month}:month:${keys.dateInfo.month}`);
        // clear players info at the end of the year
        yield clearRedisKeysByPattern(`player:*:cat:${catId}:mode:${mode}:${keys.dateInfo.year}`);
        // update game reward stats
        logger_1.default.info(`Monthly game players stats synced successfully.`);
    }
    catch (error) {
        logger_1.default.error(`Error rewarding monthly players: ${error.message}`);
        throw error;
    }
});
const syncMonthlyPlayersData = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // get all categories
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
            .process((_a) => __awaiter(void 0, [_a], void 0, function* ({ catId, gameId, mode }) {
            yield syncMonthlyPlayerStats({ catId, gameId, mode });
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
        yield (0, helpers_1.retryExecution)(syncMonthlyPlayersData, 3);
        logger_1.default.info("Syncing Redis To Prisma Mothly Game Category stats completed successfully.");
        process.exit(0);
    }
    catch (error) {
        logger_1.default.info("Error: Syncing Redis To Prisma Mothly Game Category stats failed after retries.");
        process.exit(1);
    }
}))();
