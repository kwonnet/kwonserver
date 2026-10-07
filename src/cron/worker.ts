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
  catch(err) {logger.error({event:'shutdown_failed',err},'Background worker shutdown failed');code=1;}
  finally { process.exit(code); }
}
process.once('SIGTERM', () => void shutdown(0));
process.once('SIGINT', () => void shutdown(0));
void startCronJobs().then(()=>logger.info({event:'workers_started'},'Background workers started')).catch(err => { logger.error({event:'worker_startup_failed',err},'Cannot start background workers'); void shutdown(1); });
