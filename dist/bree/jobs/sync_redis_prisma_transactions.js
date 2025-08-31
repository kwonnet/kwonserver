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
const pino_1 = __importDefault(require("pino"));
const helpers_1 = require("@/utils/helpers");
const redis_1 = __importDefault(require("@/redis"));
const promise_pool_1 = require("@supercharge/promise-pool");
const logger = (0, pino_1.default)({
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true, // Add colors
            singleLine: false, // Format logs over multiple lines for readability
            translateTime: true, // Show human-readable time
        },
    },
});
function fetchTxnsForSync(playerId_1) {
    return __awaiter(this, arguments, void 0, function* (playerId, limit = 100) {
        const key = `user:${playerId}:transactions`;
        const min = "0";
        const max = "100000000000000000000000";
        const records = yield redis_1.default.zRangeWithScores(key, min, max, {
            LIMIT: { offset: 0, count: limit },
            BY: "SCORE",
        });
        return records.map((item) => ({ timestamp: item.score, item: JSON.parse(item.value) }));
    });
}
function syncRedisTxnsToPrisma(playerId) {
    return __awaiter(this, void 0, void 0, function* () {
        const batchSize = 200;
        let counter = 0;
        while (true) {
            counter++;
            const txns = yield fetchTxnsForSync(playerId, batchSize);
            if (txns.length === 0)
                break;
            // Start a Redis transaction
            const redisTrxn = redis_1.default.multi();
            // Update the last synced timestamp
            const lastTimestamp = txns[txns.length - 1].timestamp;
            // Add the Redis operation to the transaction (we'll delete the synced transactions later)
            redisTrxn.zRemRangeByScore(`user:${playerId}:transactions`, 0, lastTimestamp);
            try {
                // Sync records to Prisma
                yield db_1.default.transaction.createMany({
                    data: txns.map(({ item }) => (Object.assign(Object.assign({}, item), { createdAt: new Date(item.createdAt), metadata: item.metadata }))),
                });
                // If Prisma operation succeeds, execute Redis transaction
                yield redisTrxn.exec();
                logger.info(`Batch ${counter} Redis to Prisma txns succeeded`);
            }
            catch (error) {
                // If an error occurs during the Prisma operation, we need to rollback Redis changes
                // Abort the Redis transaction (no changes will be applied)
                redisTrxn.discard();
                // Handle error (e.g., log or notify)
                logger.error(`Error: Batch ${counter} Redis to Prisma syncing txns failed.`, error === null || error === void 0 ? void 0 : error.message);
                // Optionally, throw or return if you need to handle the error at a higher level
                throw new Error('Error: Syncing Redis and Prisma data failed');
            }
        }
    });
}
const syncUserTxns = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userKeys = yield redis_1.default.keys("user:*:transactions");
        const { results, errors } = yield promise_pool_1.PromisePool.for(userKeys)
            .withConcurrency(1000)
            .useCorrespondingResults()
            .process((key) => __awaiter(void 0, void 0, void 0, function* () {
            const playerId = key.split(":")[1];
            return yield syncRedisTxnsToPrisma(playerId);
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
        logger.info('Syncing Redis txns to Prisma completed successfully.');
        process.exit(0);
    }
    catch (error) {
        logger.info('Error: Syncing Redis txns to Prisma failed after retries.');
        process.exit(1);
    }
}))();
