// Resolve path aliases
import 'tsconfig-paths/register';
import Bree  from 'bree'
import Graceful from '@ladjs/graceful'
import path from 'path';
import logger from '@/logger';

Bree.extend(require('@breejs/ts-worker'));

const breeJob = new Bree({
  
  logger,

  errorHandler: (error, workerMetadata) => {
    // workerMetadata will be populated with extended worker information only if
    // Bree instance is initialized with parameter `workerMetadata: true`
    if (workerMetadata.threadId) {
      logger.info(`There was an error while running a worker ${workerMetadata.name} with thread ID: ${workerMetadata.threadId}`)
    } else {
      logger.info(`There was an error while running a worker ${workerMetadata.name}`)
    }

    logger.error(error?.message);
    // errorService.captureException(error);
  },

  defaultExtension: process.env.TS_NODE ? 'ts' : 'js',

  acceptedExtensions: ['.ts', '.js'],

  root: path.join(__dirname, '../bree/jobs/'),

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

    // run this job after every 5 minutes
    // {
    //     name: 'sync_users_interactions_clickhouse',
    //     // path: typescript_worker,
    //     // worker: { 
    //     //   // argv: ['-r', 'ts-node/register'],
    //     //   workerData: { 
    //     //     // __filename: path.join(__dirname, './jobs/sync_redis_prisma_transactions.ts')
    //     //     path: path.join(__dirname, './jobs/sync_redis_prisma_transactions')
    //     // } } ,
    //     cron: '*/2 * * * *'
    // },
  ]
});

// function typescript_worker() {
//     require('ts-node').register()
//     const workerData = require('worker_threads').workerData
//     require(workerData.__filename)
// }

const graceful = new Graceful({brees:[breeJob]})

graceful.listen()

breeJob.on('worker created', (name) => {
    logger.info('worker created', name);
  });
  
breeJob.on('worker deleted', (name) => {
    logger.info('worker deleted', name);
});

export const startBreeJob = async () => {
  try {
    await breeJob.start();
  } catch (error: any) {
    logger.error(`Starting Bree - Bullmq Cron Job Error - ${error?.message}`);
  }
}
  

export default breeJob