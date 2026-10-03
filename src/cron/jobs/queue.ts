import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import logger from '@/logger';
import { APP_SUBSCRIPTION_QUEUE, APP_SUBSCRIPTION_REMINDER_QUEUE, POST_EMBEDDING_QUEUE, POST_KEYWORDS_QUEUE, POST_TOPIC_QUEUE } from '../helpers';

export const queueConnection = new IORedis(String(process.env.REDIS_URL), {
  maxRetriesPerRequest: 1,
  commandTimeout: 5000,
  connectionName: `kwonserver:${process.env.RUN_BACKGROUND_JOBS === 'false' ? 'api' : 'worker'}:queues`,
  enableReadyCheck: false,
});


export const appSubscriptionQueue = new Queue(APP_SUBSCRIPTION_QUEUE, {
  connection: queueConnection,
});

export const appSubReminderQueue = new Queue(APP_SUBSCRIPTION_REMINDER_QUEUE, {
  connection: queueConnection,
});

export const postEmbeddingQueue = new Queue(POST_EMBEDDING_QUEUE, {
  connection: queueConnection,
});

export const postTopicQueue = new Queue(POST_TOPIC_QUEUE, {
  connection: queueConnection,
});

export const postKeywordsQueue = new Queue(POST_KEYWORDS_QUEUE, {
  connection: queueConnection,
});
// Never log raw Redis errors: AUTH command arguments may contain credentials.
queueConnection.on('error', () => logger.warn('Redis queue connection unavailable'));
for (const queue of [appSubscriptionQueue, appSubReminderQueue, postEmbeddingQueue, postTopicQueue, postKeywordsQueue]) {
  queue.on('error', () => logger.warn({ queue: queue.name }, 'Redis queue unavailable'));
}

export async function closeJobQueues() {
  await Promise.all([appSubscriptionQueue, appSubReminderQueue, postEmbeddingQueue, postTopicQueue, postKeywordsQueue].map(queue => queue.close()));
  await queueConnection.quit();
}
