"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appSubReminderQueue = exports.appSubscriptionQueue = void 0;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const connection = new ioredis_1.default({ maxRetriesPerRequest: null });
exports.appSubscriptionQueue = new bullmq_1.Queue('appSubscriptionQueue', {
    connection,
});
exports.appSubReminderQueue = new bullmq_1.Queue('appSubReminderQueue', {
    connection,
});
