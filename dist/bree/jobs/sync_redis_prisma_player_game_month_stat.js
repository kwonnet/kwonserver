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
const db_1 = __importDefault(require("@/db"));
const redis_1 = __importDefault(require("@/redis"));
const promise_pool_1 = require("@supercharge/promise-pool");
const utils_1 = require("@/utils");
const helpers_1 = require("@/utils/helpers");
const logger_1 = __importDefault(require("@/logger"));
function syncPlayerMonthStatToRedis(item) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const mode = (0, utils_1.getGameMode)(item.mode);
            // current date
            const currDate = new Date().toISOString();
            // get expiration
            const expire = (0, utils_1.getMonthlyExpiration)();
            // get day after week expireAt
            const remainingDays = (0, utils_1.getRemainingDaysInMonth)();
            const expireAt = (0, utils_1.getExpiryAtUTC)(remainingDays + 7);
            const todayExpireAt = (0, utils_1.getExpiryAtUTC)(1);
            // get ranking keys
            const rankingKeys = (0, utils_1.getRankingKeys)(item.catId, mode);
            // player hash unique keys
            const playerKeys = (0, utils_1.getPlayerRedisKeys)(item.playerId, item.catId, mode);
            // player infor
            const playerInfo = {
                id: item.playerId,
                name: item.player.username,
                createdAt: currDate,
                lastLoggedIn: currDate,
            };
            const score = { score: item.score, numPlayed: item.numPlayed };
            yield Promise.all([
                // ranking
                redis_1.default.zAdd(rankingKeys.month, { score: item.score, value: item.playerId }),
                redis_1.default.zAdd(rankingKeys.week, { score: item.score, value: item.playerId }),
                redis_1.default.zAdd(rankingKeys.today, { score: item.score, value: item.playerId }),
                // player tracking data
                redis_1.default.hSet(playerKeys.month, score),
                redis_1.default.hSet(playerKeys.week, score),
                redis_1.default.hSet(playerKeys.today, score),
                // player info
                redis_1.default.hSet(playerKeys.info, playerInfo)
            ]);
            yield Promise.all([
                // expire ranking keys
                redis_1.default.expire(rankingKeys.month, expire),
                redis_1.default.expireAt(rankingKeys.week, expireAt),
                redis_1.default.expireAt(rankingKeys.today, todayExpireAt),
                // expire player keys
                redis_1.default.expire(playerKeys.info, expire),
                redis_1.default.expire(playerKeys.month, expire),
                redis_1.default.expireAt(playerKeys.week, expireAt),
                redis_1.default.expireAt(playerKeys.today, todayExpireAt),
            ]);
        }
        catch (error) {
            throw error;
        }
    });
}
const syncUserTxns = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const stat = (0, utils_1.getCurrentDataInfo)();
        const totalRecords = yield db_1.default.gameMonthStat.count();
        logger_1.default.info(`About ${totalRecords} Prisma Player Month Stats Records Found`);
        let skip = 0;
        const take = 500;
        let counter = 0;
        while (skip < totalRecords) {
            counter++;
            logger_1.default.info(`<<<<Starting Batch ${counter} Records Syncing>>>>`);
            const monthData = yield db_1.default.gameMonthStat.findMany({ where: stat, include: { player: { select: { username: true, id: true } } }, take, skip, orderBy: [{ id: "desc" }] });
            const { errors } = yield promise_pool_1.PromisePool.for(monthData)
                .withConcurrency(250)
                .useCorrespondingResults()
                .process((item) => __awaiter(void 0, void 0, void 0, function* () {
                return yield syncPlayerMonthStatToRedis(item);
            }));
            // check errors and dispatch
            if (errors.length > 0) {
                throw new Error("Error: " + (errors === null || errors === void 0 ? void 0 : errors.map(i => i.message).join(", ")));
            }
            logger_1.default.info(`<<<<Ended Batch ${counter} Records Syncing>>>>`);
            skip += take;
        }
    }
    catch (error) {
        throw error;
    }
});
(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        logger_1.default.info("Executing Prisma Player Month Stats to Redis Job....");
        yield (0, helpers_1.retryExecution)(syncUserTxns, 3);
        logger_1.default.info('Syncing Prisma Player Month Stats to Redis completed.');
        process.exit(0);
    }
    catch (error) {
        logger_1.default.info('Error: Syncing Prisma Player Month Stats to Redis failed after retries.');
        process.exit(1);
    }
}))();
