import 'dotenv/config';
import { startCronJobs, stopCronJobs } from './index';
import prisma from '@/db';
import redis from '@/redis';
import logger from '@/logger';
let stopping = false;
async function shutdown(code: number) {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 30000);
  deadline.unref();
  try { await stopCronJobs(); await prisma.$disconnect(); if (redis.isOpen) await redis.quit(); }
  finally { process.exit(code); }
}
process.once('SIGTERM', () => void shutdown(0));
process.once('SIGINT', () => void shutdown(0));
void startCronJobs().catch(error => { logger.error(error, 'Cannot start background workers'); void shutdown(1); });
