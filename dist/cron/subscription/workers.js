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
exports.appSubReminderWorker = exports.appSubscriptionWorker = void 0;
const db_1 = __importDefault(require("@/db"));
const bullmq_1 = require("bullmq");
const subscriptions_1 = require("@/services/v1/subscriptions");
const client_1 = require("@prisma/client");
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = __importDefault(require("@/logger"));
const utils_1 = require("../utils");
const connection = new ioredis_1.default({ maxRetriesPerRequest: null });
exports.appSubscriptionWorker = new bullmq_1.Worker("appSubscriptionQueue", (job) => __awaiter(void 0, void 0, void 0, function* () {
    const { subscriptionId: id } = job.data;
    logger_1.default.info(`Processing subscription job: ${id}`);
    // check if the subscription exists
    const currentSub = yield db_1.default.subscription.findFirst({
        where: { id, status: { notIn: [client_1.SubStatusEnum.CANCELLED, client_1.SubStatusEnum.EXPIRED] } },
        select: { id: true, userId: true, endDate: true, createdAt: true },
    });
    if (!currentSub) {
        logger_1.default.error(`Subscription not found: ${id}`);
        throw new Error(`Subscription not found: ${id}`);
    }
    // try to renew the subscription
    const result = yield (0, subscriptions_1.renewAppSubscriptionWithWallet)(id);
    logger_1.default.info({ status: result.status, message: result.message }, `Renewing subscription`);
    logger_1.default.info(`Job attempts made ${job.attemptsMade}`);
    // insert notification
    yield db_1.default.notification.create({
        data: {
            title: "App subscription renewal",
            message: result.message,
            recipientId: currentSub.userId,
            meta: { type: "SUBSCRIPTION" },
        },
    });
    // check if the job has been attempted once
    if (result.isError && job.attemptsMade < 1) {
        logger_1.default.warn(`App subscription renewal failed first time ${id}`);
        yield db_1.default.subscription.update({ where: { id }, data: { status: client_1.SubStatusEnum.PAYMENT_ERROR } });
        throw new Error(result.message);
    }
    if (result.isError) {
        logger_1.default.warn(`App subscription renewal failed second time - ${id}`);
        // cancel subscription
        yield (0, subscriptions_1.cancelAppSubscription)({ status: client_1.SubStatusEnum.EXPIRED, subId: id });
        // throw
        throw new Error(result.message);
    }
    // Reschedule subscription job again based on the new params and don't set it as the last scheduled job
    (0, utils_1.insertSubscriptionJob)(currentSub, false);
}), { connection });
exports.appSubReminderWorker = new bullmq_1.Worker("appSubReminderQueue", (job) => __awaiter(void 0, void 0, void 0, function* () {
    const { subscriptionId: id } = job.data;
    logger_1.default.info(`Processing subscription reminder job: ${id}`);
    const currentSub = yield db_1.default.subscription.findUnique({
        where: { id, status: { notIn: [client_1.SubStatusEnum.CANCELLED, client_1.SubStatusEnum.EXPIRED] } },
        select: { id: true, userId: true, status: true },
    });
    if (!currentSub) {
        throw new Error(`Subscription is inactive or not found`);
    }
    // notify user of upcoming subscription renewal
    yield db_1.default.notification.create({
        data: {
            title: "App subscription reminder",
            message: "Your app subscription payment renewal is due tomorrow.",
            recipientId: currentSub.userId,
            meta: { type: "SUBSCRIPTION" },
        },
    });
    logger_1.default.info(`Reminder sent for subscription ${id}`);
}), { connection });
