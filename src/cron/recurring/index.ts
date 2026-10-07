import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import logger from '@/logger';
import {logWorkerLifecycle} from '@/logger/events';
import { processRecurringJob, registerRecurringJobs } from './registry';

export async function startRecurringJobs() {
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required for background jobs');
  const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on('error', err => logger.error({event:'queue_connection_error',queue:'kwonserverBackgroundJobs',err},'Redis recurring connection unavailable'));
  const queue = new Queue('kwonserverBackgroundJobs', { connection });
  queue.on('error', err => logger.error({event:'queue_error',queue:queue.name,err},'Redis recurring queue unavailable'));
  const worker = new Worker('kwonserverBackgroundJobs', processRecurringJob, {
    connection, autorun: false, concurrency: 1,
    // A stalled payout must be reviewed instead of silently being paid twice.
    maxStalledCount: 0,
  });
  logWorkerLifecycle(worker);
  const close = async () => { await worker.close(); await queue.close(); await connection.quit(); };
  try {
    // Distributed limit, including when more than one worker replica is running.
    await queue.setGlobalConcurrency(1);
    await registerRecurringJobs(queue);
    void worker.run().catch(err => logger.error({event:'queue_stopped',queue:worker.name,err},'Background worker stopped'));
    return { queue, worker, close };
  } catch (error) { await close(); throw error; }
}
