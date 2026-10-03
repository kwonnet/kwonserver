import { Queue } from 'bullmq';
import Redis from 'ioredis';
import prisma from '@/db';
import logger from '@/logger';
import { QuestionInventoryService, GenerationJob } from './service';
export const QUIZ_QUEUE = 'quiz-generation';
let runtime: ReturnType<typeof createRuntime> | undefined;
function createRuntime() {
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL required for quiz inventory');
  // API producers fail promptly if Redis is unavailable; workers use a separate connection.
  const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1, commandTimeout: 5000, connectTimeout: 5000,
  });
  redis.on('error', () => logger.warn('Quiz inventory Redis unavailable'));
  const queue = new Queue<GenerationJob>(QUIZ_QUEUE, { connection: redis });
  queue.on('error', () => logger.warn('Quiz generation queue unavailable'));
  const service = new QuestionInventoryService(prisma, redis, queue, undefined, logger);
  return { redis, queue, service };
}
export function getQuestionInventory() { return (runtime ??= createRuntime()).service; }
export async function closeQuestionInventory() {
  if (runtime) { await runtime.queue.close(); await runtime.redis.quit(); runtime = undefined; }
}
