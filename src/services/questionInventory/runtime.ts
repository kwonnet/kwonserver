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
  queue.on('error', () => logger.warn('Quiz generation queue unavailable'));
  const service = new QuestionInventoryService(prisma, redis, queue, undefined, logger);
  return { redis, queue, service };
}
export function getQuestionInventory() { return (runtime ??= createRuntime()).service; }
export async function closeQuestionInventory() {
  if (runtime) { await runtime.queue.close(); runtime = undefined; }
}
