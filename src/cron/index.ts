import {closeMessagingPublisher} from '@/services/v1/conversations/live';
import {closeEmailTransport} from '@/services/email';
import logger from '@/logger';
import {logWorkerLifecycle} from '@/logger/events';
import { closeCacheStore } from '@/store';
import * as queues from './jobs/queue';
import { startRecurringJobs } from './recurring';
import { startQuizGeneration } from './quizGeneration';
import { closeQuestionInventory } from '@/services/questionInventory/runtime';

let workers: typeof import('./jobs/workers') | undefined;
let activeWorkers: import('bullmq').Worker[] = [];
let started = false;
let quiz: Awaited<ReturnType<typeof startQuizGeneration>> | undefined;
let recurring: Awaited<ReturnType<typeof startRecurringJobs>> | undefined;
export async function startCronJobs() {
  if (started || process.env.RUN_BACKGROUND_JOBS === 'false') return;
  started = true;
  try {
    // autorun:false does not prevent BullMQ from opening blocking connections.
    // Import only in the process that actually executes jobs.
    await queues.postTopicQueue.setGlobalConcurrency(1);
    await queues.emailQueue.setGlobalConcurrency(2);
    await queues.notificationQueue.setGlobalConcurrency(2);
    workers = await import('./jobs/workers');
    activeWorkers = [workers.appSubscriptionWorker, workers.appSubReminderWorker,
      workers.emailDeliveryWorker, workers.notificationDeliveryWorker, workers.postEmbeddingWorker, workers.postTopicWorker, workers.postKeywordsWorker];
    for (const worker of activeWorkers) {
      logWorkerLifecycle(worker);
      // run() lasts for the worker lifetime; never await workers sequentially.
      if (!worker.isRunning()) void worker.run().catch(err => logger.error({event:'queue_stopped',queue:worker.name,err},'BullMQ worker stopped'));
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
  await closeEmailTransport();
  await closeMessagingPublisher();
  await Promise.all([workers?.workerConnection.quit(), queues.closeJobQueues(), closeCacheStore()]);
  started = false;
}
