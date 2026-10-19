import 'dotenv/config';
import {startMonthlyRewardWorkers} from './monthlyRewards';
import {closeJobQueues} from './jobs/queue';
import prisma from '@/db';
import redis from '@/redis';
import logger from '@/logger';
import {closeCacheStore} from '@/store';
let service: Awaited<ReturnType<typeof startMonthlyRewardWorkers>> | undefined;
let stopping = false;
async function shutdown(code: number) {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 30000); deadline.unref();
  try {
    await service?.close(); await closeJobQueues(); await closeCacheStore();
    await prisma.$disconnect(); if (redis.isOpen) await redis.quit();
  } catch (error) {logger.error({event: 'monthly_reward_shutdown_failed', error}, 'Reward worker shutdown failed'); code = 1;}
  process.exit(code);
}
process.once('SIGTERM', async () => { await shutdown(0); });
process.once('SIGINT', async () => { await shutdown(0); });
async function main() {
  try {
    service = await startMonthlyRewardWorkers();
    logger.info({event: 'monthly_reward_workers_started'}, 'Dedicated monthly reward workers started');
  } catch (error) { logger.error({event: 'monthly_reward_startup_failed', error}, 'Cannot start reward workers'); await shutdown(1); }
}
const startup = main();
