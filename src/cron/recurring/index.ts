import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import logger from '@/logger';
import { processRecurringJob, registerRecurringJobs } from './registry';

export async function startRecurringJobs() {
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required for background jobs');
  const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on('error', () => logger.warn('Redis recurring connection unavailable'));
  const queue = new Queue('kwonserverBackgroundJobs', { connection });
  queue.on('error', () => logger.warn('Redis recurring queue unavailable'));
  const worker = new Worker('kwonserverBackgroundJobs', processRecurringJob, {
    connection, autorun: false, concurrency: 1,
    // A stalled payout must be reviewed instead of silently being paid twice.
    maxStalledCount: 0,
  });
  worker.on('error', () => logger.error('Background worker connection error'));
  worker.on('failed', (job, error) => logger.error({ job: job?.name, id: job?.id, error: error.message }, 'Background job failed'));
  worker.on('completed', job => logger.info({ job: job.name, id: job.id }, 'Background job completed'));
  const close = async () => { await worker.close(); await queue.close(); await connection.quit(); };
  try {
    // Distributed limit, including when more than one worker replica is running.
    await queue.setGlobalConcurrency(1);
    await registerRecurringJobs(queue);
    void worker.run().catch(error => logger.error('Background worker stopped'));
    return { queue, worker, close };
  } catch (error) { await close(); throw error; }
}
