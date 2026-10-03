import logger from '@/logger';
import * as workers from './jobs/workers';
import * as queues from './jobs/queue';
import { startRecurringJobs } from './recurring';
import { startQuizGeneration } from './quizGeneration';
import { closeQuestionInventory } from '@/services/questionInventory/runtime';

const activeWorkers = [workers.appSubscriptionWorker, workers.appSubReminderWorker,
  workers.postEmbeddingWorker, workers.postTopicWorker, workers.postKeywordsWorker];
let started = false;
let quiz: Awaited<ReturnType<typeof startQuizGeneration>> | undefined;
let recurring: Awaited<ReturnType<typeof startRecurringJobs>> | undefined;
export async function startCronJobs() {
  if (started || process.env.RUN_BACKGROUND_JOBS === 'false') return;
  started = true;
  try {
    for (const worker of activeWorkers) {
      worker.on('error', error => logger.error(error, 'BullMQ worker error'));
      worker.on('failed', (job, error) => logger.error({ job: job?.name, error: error.message }, 'BullMQ job failed'));
      // run() lasts for the worker lifetime; never await workers sequentially.
      if (!worker.isRunning()) void worker.run().catch(error => logger.error(error, 'BullMQ worker stopped'));
    }
    recurring = await startRecurringJobs();
    quiz = await startQuizGeneration();
  } catch (error) { await stopCronJobs(); throw error; }
}
let closing: Promise<void> | undefined;
export function stopCronJobs() {
  return closing ??= closeCronJobs();
}
async function closeCronJobs() {
  await Promise.all(activeWorkers.map(worker => worker.close()));
  if (recurring) await recurring.close();
  if (quiz) await quiz.close();
  await closeQuestionInventory();
  await Promise.all([queues.appSubscriptionQueue, queues.appSubReminderQueue,
    queues.postEmbeddingQueue, queues.postTopicQueue, queues.postKeywordsQueue].map(queue => queue.close()));
  await Promise.all([workers.workerConnection.quit(), queues.queueConnection.quit()]);
  started = false;
}
