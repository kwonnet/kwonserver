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
exports.getLastScheduledJob = getLastScheduledJob;
exports.updateLastScheduledJob = updateLastScheduledJob;
exports.insertSubscriptionJob = insertSubscriptionJob;
exports.addSubscriptionCronJob = addSubscriptionCronJob;
exports.removeSubscriptionCronJob = removeSubscriptionCronJob;
const db_1 = __importDefault(require("@/db"));
const redis_1 = __importDefault(require("@/redis"));
const client_1 = require("@prisma/client");
const queue_1 = require("../subscription/queue");
const logger_1 = __importDefault(require("@/logger"));
const helpers_1 = require("@/utils/helpers");
const LAST_SCHEDULED_KEY = "appSubLastScheduledJob";
function getLastScheduledJob() {
    return __awaiter(this, void 0, void 0, function* () {
        const lastScheduled = yield redis_1.default.get(LAST_SCHEDULED_KEY);
        return lastScheduled ? new Date(lastScheduled) : null;
    });
}
function updateLastScheduledJob(date) {
    return __awaiter(this, void 0, void 0, function* () {
        yield redis_1.default.set(LAST_SCHEDULED_KEY, date.toISOString());
    });
}
function insertSubscriptionJob(sub_1) {
    return __awaiter(this, arguments, void 0, function* (sub, isLastScheduled = true) {
        try {
            yield (0, helpers_1.delayExecution)(500);
            logger_1.default.info(sub, "Inserting subscription");
            const subscriptionJobName = `sub-${sub.id}`;
            const reminderJobName = `reminder-${sub.id}`;
            const jobId = `${sub.userId.slice(-10)}-${sub.id.slice(-10)}`;
            // remove any old sub & reminder jobs with the same id
            const subRemoved = yield queue_1.appSubscriptionQueue.remove(jobId, { removeChildren: true });
            const reminderRemoved = yield queue_1.appSubReminderQueue.remove(jobId, { removeChildren: true });
            logger_1.default.info(`Deleting old jobs for subscription ${sub.id}, sub: ${subRemoved}, reminder: ${reminderRemoved}`);
            // calculate date delay
            const now = new Date();
            const nextPaymentDelay = new Date(sub.endDate).getTime() - now.getTime();
            const reminderDelay = nextPaymentDelay - (1000 * 60 * 60 * 24);
            const backoffDelay = 24 * 60 * 60 * 1000;
            // Calculate date
            // const nextPaymentDate = dayjs().add(3, "minute");
            // const nextPaymentDelay = nextPaymentDate.diff(dayjs(), "millisecond");
            // const reminderDate = nextPaymentDate.subtract(1, "minute").toDate();
            // const reminderDelay = reminderDate.getTime() - now.getTime();
            // const backoffDelay = 30 * 1000;
            // console.log(nextPaymentDelay / 1000);
            // console.log(reminderDelay / 1000);
            // add delay
            yield queue_1.appSubscriptionQueue.add(subscriptionJobName, { subscriptionId: sub.id }, {
                delay: nextPaymentDelay,
                attempts: 2,
                jobId,
                backoff: { type: "fixed", delay: backoffDelay },
                removeOnComplete: true,
                removeOnFail: {
                    age: 24 * 3600, // keep up to 24 hours
                },
            });
            yield queue_1.appSubReminderQueue.add(reminderJobName, { subscriptionId: sub.id }, {
                delay: reminderDelay,
                jobId,
                removeOnComplete: true,
                removeOnFail: {
                    age: 24 * 3600, // keep up to 24 hours
                },
            });
            if (isLastScheduled) {
                //   update last scheduled job
                yield updateLastScheduledJob(new Date(sub.createdAt));
            }
            logger_1.default.info(`Inserted Scheduled job for subscription ${sub.id}`);
        }
        catch (error) {
            logger_1.default.error(`Error inserting subscription job ${sub.id}`);
        }
    });
}
function addSubscriptionCronJob(subscriptionId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            logger_1.default.info(`API Scheduled job for subscription ${subscriptionId}`);
            const sub = yield db_1.default.subscription.findUnique({
                where: {
                    id: subscriptionId,
                    isRecurring: true,
                    status: client_1.SubStatusEnum.ACTIVE,
                },
                select: {
                    isRecurring: true,
                    status: true,
                    id: true,
                    endDate: true,
                    userId: true,
                    createdAt: true,
                },
            });
            if (!sub)
                return;
            // insert job
            yield insertSubscriptionJob(sub);
        }
        catch (error) {
            logger_1.default.error(`Error adding subscription job ${subscriptionId}`);
        }
    });
}
function removeSubscriptionCronJob(arg) {
    return __awaiter(this, void 0, void 0, function* () {
        const jobId = `${arg.userId.slice(-10)}-${arg.subId.slice(-10)}`;
        try {
            // remove job
            yield queue_1.appSubscriptionQueue.remove(jobId, { removeChildren: true });
            yield queue_1.appSubReminderQueue.remove(jobId, { removeChildren: true });
            logger_1.default.info(`Removed Scheduled subscription cron ${jobId}`);
        }
        catch (error) {
            logger_1.default.error(`Error Removing subscription cron job ${jobId}`);
        }
    });
}
