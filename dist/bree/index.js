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
exports.startBreeJob = void 0;
// Resolve path aliases
require("tsconfig-paths/register");
const bree_1 = __importDefault(require("bree"));
const graceful_1 = __importDefault(require("@ladjs/graceful"));
const path_1 = __importDefault(require("path"));
const logger_1 = __importDefault(require("@/logger"));
const workers_1 = require("@/cron/subscription/workers");
bree_1.default.extend(require('@breejs/ts-worker'));
const breeJob = new bree_1.default({
    logger: logger_1.default,
    errorHandler: (error, workerMetadata) => {
        // workerMetadata will be populated with extended worker information only if
        // Bree instance is initialized with parameter `workerMetadata: true`
        if (workerMetadata.threadId) {
            logger_1.default.info(`There was an error while running a worker ${workerMetadata.name} with thread ID: ${workerMetadata.threadId}`);
        }
        else {
            logger_1.default.info(`There was an error while running a worker ${workerMetadata.name}`);
        }
        logger_1.default.error(error === null || error === void 0 ? void 0 : error.message);
        // errorService.captureException(error);
    },
    defaultExtension: process.env.TS_NODE ? 'ts' : 'js',
    acceptedExtensions: ['.ts', '.js'],
    root: path_1.default.join(__dirname, '../bree/jobs/'),
    doRootCheck: true,
    removeCompleted: true,
    jobs: [
        // run this job after every 60 minutes
        {
            name: 'sync_redis_prisma_transactions',
            // path: typescript_worker,
            // worker: { 
            //   // argv: ['-r', 'ts-node/register'],
            //   workerData: { 
            //     // __filename: path.join(__dirname, './jobs/sync_redis_prisma_transactions.ts')
            //     path: path.join(__dirname, './jobs/sync_redis_prisma_transactions')
            // } } ,
            cron: '*/30 * * * *'
        },
        // run this job after every 30 minutes
        {
            name: 'sync_redis_prisma_wallet',
            // path: typescript_worker,
            // worker: { 
            //   // argv: ['-r', 'ts-node/register'],
            //   workerData: { 
            //     // __filename: path.join(__dirname, './jobs/sync_redis_prisma_wallet.ts') 
            //     path: path.join(__dirname, './jobs/sync_redis_prisma_wallet') 
            // } } ,
            cron: '*/45 * * * *'
        },
        // run this task at 12:00 AM every Monday
        {
            name: 'reward_top_players_every_week',
            // path: typescript_worker,
            // worker: { 
            //   // argv: ['-r', 'ts-node/register'],
            //   workerData: { 
            //     // __filename: path.join(__dirname, './jobs/reward_top_players_every_week.ts') 
            //     path: path.join(__dirname, './jobs/reward_top_players_every_week') 
            // } } ,
            // cron: '*/59 * * * *',
            cron: "0 0 * * 1"
        },
        // reward players on the first day of the next month by 2:00AM
        {
            name: 'reward_top_players_every_month',
            // path: typescript_worker,
            // worker: { 
            //   // argv: ['-r', 'ts-node/register'],
            //   workerData: { 
            //     // __filename: path.join(__dirname, './jobs/reward_top_players_every_month.ts')
            //     path: path.join(__dirname, './jobs/reward_top_players_every_month')  
            // } } ,
            cron: '0 2 1 * *',
            // cron: '*/2 * * * *'
        },
        // sync games monthly stat on the first day of the next month by 12:00PM
        {
            name: 'sync_redis_prisma_game_month_stat',
            // path: typescript_worker,
            // worker: {
            //     // argv: ['-r', 'ts-node/register'], 
            //     workerData: { 
            //     // __filename: path.join(__dirname, './jobs/sync_redis_prisma_game_month_stat.ts') 
            //     path: path.join(__dirname, './jobs/sync_redis_prisma_game_month_stat')
            // } } ,
            cron: '0 12 1 * *',
            // cron: '*/2 * * * *'
        },
        // reward top players of the year based on category ~ 2nd day new year @ 12:00PM
        {
            name: 'reward_top_players_of_the_year',
            // path: typescript_worker,
            // worker: {
            //     // argv: ['-r', 'ts-node/register'], 
            //     workerData: { 
            //     // __filename: path.join(__dirname, './jobs/reward_top_players_of_the_year.ts')
            //     path: path.join(__dirname, './jobs/reward_top_players_of_the_year')  
            // } } ,
            cron: '0 12 2 * *',
            // cron: '*/2 * * * *'
        },
        // reward champ of the the year based on game type ~ 2nd day new year @ 12:00PM
        {
            name: 'reward_champ_of_the_year',
            // path: typescript_worker,
            // worker: {
            //     // argv: ['-r', 'ts-node/register'], 
            //     workerData: { 
            //     // __filename: path.join(__dirname, './jobs/reward_champ_of_the_year.ts') 
            //     path: path.join(__dirname, './jobs/reward_champ_of_the_year') 
            // } } ,
            cron: '0 12 2 * *',
            // cron: '*/1 * * * *'
        },
        // reward grand champ of the the year based on game type ~ 2nd day new year @ 12:00PM
        {
            name: 'reward_grand_champ_of_the_year',
            // path: typescript_worker,
            // worker: {
            //     // argv: ['-r', 'ts-node/register'], 
            //     workerData: { 
            //     // __filename: path.join(__dirname, './jobs/reward_grand_champ_of_the_year.ts')
            //     path: path.join(__dirname, './jobs/reward_grand_champ_of_the_year') 
            // } } ,
            cron: '0 12 2 * *',
            // cron: '*/1 * * * *'
        },
        // schedule app wallet recurring payments after every 10 minutes
        {
            name: 'schedule_app_wallet_subscription',
            // path: typescript_worker,
            // worker: {
            //     // argv: ['-r', 'ts-node/register'], 
            //     workerData: { 
            //     // __filename: path.join(__dirname, './jobs/reward_grand_champ_of_the_year.ts')
            //     path: path.join(__dirname, './jobs/reward_grand_champ_of_the_year') 
            // } } ,
            cron: '*/2 * * * *'
        },
    ]
});
// function typescript_worker() {
//     require('ts-node').register()
//     const workerData = require('worker_threads').workerData
//     require(workerData.__filename)
// }
const graceful = new graceful_1.default({ brees: [breeJob] });
graceful.listen();
breeJob.on('worker created', (name) => {
    logger_1.default.info('worker created', name);
});
breeJob.on('worker deleted', (name) => {
    logger_1.default.info('worker deleted', name);
});
const startBreeJob = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield breeJob.start();
        logger_1.default.info('Bree Cron Job Started');
        if (!workers_1.appSubscriptionWorker.isRunning()) {
            yield workers_1.appSubscriptionWorker.run();
            logger_1.default.info('App Subscription Cron Job Worker Started');
        }
        if (!workers_1.appSubReminderWorker.isRunning()) {
            yield workers_1.appSubReminderWorker.run();
            logger_1.default.info('App Subscription Reminder Cron Job Worker Started');
        }
    }
    catch (error) {
        logger_1.default.error(`Starting Bree - Bullmq Cron Job Error - ${error === null || error === void 0 ? void 0 : error.message}`);
    }
});
exports.startBreeJob = startBreeJob;
exports.default = breeJob;
