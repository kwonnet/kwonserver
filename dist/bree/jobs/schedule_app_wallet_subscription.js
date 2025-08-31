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
const utils_1 = require("@/cron/utils");
const db_1 = __importDefault(require("@/db"));
const logger_1 = __importDefault(require("@/logger"));
const client_1 = require("@prisma/client");
(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const lastScheduledJobDate = (yield (0, utils_1.getLastScheduledJob)()) || new Date(0); // Fallback to epoch if Redis is empty
        // Fetch subscriptions to schedule
        const subscriptions = yield db_1.default.subscription.findMany({
            where: {
                status: client_1.SubStatusEnum.ACTIVE,
                isRecurring: true,
                isPrimary: true,
                transactions: { some: { currency: client_1.TxnCurrencyEnum.TZX } },
                createdAt: { gt: lastScheduledJobDate },
            },
            select: { id: true, userId: true, endDate: true, createdAt: true },
            orderBy: [{ createdAt: "asc" }],
        });
        logger_1.default.info(subscriptions, "subscriptions: ");
        for (const sub of subscriptions) {
            yield (0, utils_1.insertSubscriptionJob)(sub);
            logger_1.default.info(`Scheduled jobs for sub ${sub.id}`);
        }
        // Update the last scheduled job time
        // if (subscriptions.length > 0) {
        //   const lastJobDate = subscriptions[subscriptions.length - 1].createdAt;
        //   await updateLastScheduledJob(lastJobDate);
        // }
        process.exit(0);
    }
    catch (error) {
        logger_1.default.error(`Error scheduling app sub jobs ~ ${error.message}`);
        process.exit(1);
    }
}))();
