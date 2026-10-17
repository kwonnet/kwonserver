import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { getQuestionInventory, QUIZ_QUEUE } from '@/services/questionInventory/runtime';
import { sentenceGame } from '@/utils/word-games';
import { questionGenerator } from '@/services/questionInventory/generator';
import { generationProcessor } from '@/services/questionInventory/processor';
import logger from '@/logger';
import {logWorkerLifecycle} from '@/logger/events';
export async function startQuizGeneration() {
  const inventory = getQuestionInventory();
  await inventory.queue.waitUntilReady();
  await inventory.queue.setGlobalConcurrency(inventory.config.concurrency);
  const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
  connection.on('error', err => logger.warn({ err }, 'Quiz worker Redis unavailable'));
  const worker = new Worker(QUIZ_QUEUE, generationProcessor(inventory, questionGenerator), {
    connection, concurrency: inventory.config.concurrency, autorun: false,
  });
  logWorkerLifecycle(worker);
  void worker.run().catch(err => logger.error({event:'queue_stopped',queue:worker.name,err},'Quiz generation worker stopped'));
  // Prewarm sentence games so first-time players do not wait for a model call.
  // The same deduplicated jobs are also requested on demand when supply runs low.
  try {
    const categories = await inventory.db.gameCategory.findMany({where:{game:{name:{contains:'mindmash',mode:'insensitive'}}},select:{id:true,name:true}});
    for (const category of categories) if (sentenceGame(category.name)) await inventory.ensureInventory(category.id);
  } catch (err) { logger.warn({event:'sentence_inventory_prewarm_failed',err},'Sentence inventory will retry on room demand'); }
  return { close: async () => { await worker.close(); await connection.quit(); } };
}
