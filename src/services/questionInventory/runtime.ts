import { Queue } from 'bullmq';
import { queueConnection } from '@/cron/jobs/queue';
import prisma from '@/db';
import logger from '@/logger';
import { QuestionInventoryService, GenerationJob } from './service';
export const QUIZ_QUEUE = 'quiz-generation';
let runtime: ReturnType<typeof createRuntime> | undefined;
function createRuntime() {
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL required for quiz inventory');
  const redis = queueConnection;
  const queue = new Queue<GenerationJob>(QUIZ_QUEUE, { connection: redis });
  queue.on('error', err => logger.error({event:'queue_error',queue:queue.name,err},'Quiz generation queue unavailable'));
  queue.on('waiting',job=>logger.info({event:'job_queued',queue:queue.name,job:job.name,jobId:job.id},'Quiz generation job queued'));
  const service = new QuestionInventoryService(prisma, redis, queue, undefined, logger);
  return { redis, queue, service };
}
export function getQuestionInventory() { return (runtime ??= createRuntime()).service; }
export async function closeQuestionInventory() {
  if (runtime) { await runtime.queue.close(); runtime = undefined; }
}
