import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { getQuestionInventory, QUIZ_QUEUE } from '@/services/questionInventory/runtime';
import { questionGenerator } from '@/services/questionInventory/generator';
import { generationProcessor } from '@/services/questionInventory/processor';
import logger from '@/logger';
export async function startQuizGeneration() {
  const inventory = getQuestionInventory();
  await inventory.queue.waitUntilReady();
  await inventory.queue.setGlobalConcurrency(inventory.config.concurrency);
  const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
  connection.on('error', () => logger.warn('Quiz worker Redis unavailable'));
  const worker = new Worker(QUIZ_QUEUE, generationProcessor(inventory, questionGenerator), {
    connection, concurrency: inventory.config.concurrency, autorun: false,
  });
  worker.on('error', () => logger.error('Quiz worker connection/processing error'));
  worker.on('failed', job => logger.error({ categoryId: job?.data.categoryId,
    jobId: job?.id, attempt: job?.attemptsMade }, 'Quiz generation failed; inspect job status'));
  void worker.run().catch(() => logger.error('Quiz generation worker stopped'));
  return { close: async () => { await worker.close(); await connection.quit(); } };
}
