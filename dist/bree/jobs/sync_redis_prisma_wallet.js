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
function syncUserRedisWalletToPrisma(playerId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const walletKey = `user:${playerId}:wallet`;
            // get user wallet
            const result = yield redis_1.default.hGetAll(walletKey);
            // check if wallet is null
            if (Object.keys(result).length === 0)
                return;
            // update object
            const wallet = {
                bonus: parseFloat(result.bonus || "0"),
                amount: parseFloat(result.amount || "0"),
                credit: parseFloat(result.credit || "0"),
            };
            // perform prisma update
            yield db_1.default.wallet.update({ where: { id: result.id, userId: result.userId }, data: wallet });
            // check if user session is inactive for more than 4 minutes and remove this wallet
            const sessionKey = `user:${playerId}:session`;
            const date = yield redis_1.default.get(sessionKey);
            if (!date)
                return;
            const isExpired = (0, utils_1.isDateMinuteElapsed)(date, 4);
            if (isExpired) {
                yield Promise.all([redis_1.default.del(sessionKey), redis_1.default.del(walletKey)]);
            }
        }
        catch (error) {
            throw error;
        }
    });
}
const syncUserTxns = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const playerKeys = yield redis_1.default.keys("user:*:wallet");
        const { results, errors } = yield promise_pool_1.PromisePool.for(playerKeys)
            .withConcurrency(1000)
            .useCorrespondingResults()
            .process((key) => __awaiter(void 0, void 0, void 0, function* () {
            const playerId = key.split(":")[1];
            return yield syncUserRedisWalletToPrisma(playerId);
        }));
        // check errors and dispatch
        if (errors.length > 0) {
            throw new Error("Error: " + (errors === null || errors === void 0 ? void 0 : errors.map(i => i.message).join(", ")));
        }
        return results;
    }
    catch (error) {
        throw error;
    }
});
(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, helpers_1.retryExecution)(syncUserTxns, 3);
        logger_1.default.info('Syncing Redis Wallet to Prisma completed successfully.');
        process.exit(0);
    }
    catch (error) {
        logger_1.default.info('Error: Syncing Wallet txns to Prisma failed after retries.');
        process.exit(1);
    }
}))();
