import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import logger from '@/logger';
import { NOTIFICATION_DELIVERY_QUEUE, EMAIL_DELIVERY_QUEUE, APP_SUBSCRIPTION_QUEUE, APP_SUBSCRIPTION_REMINDER_QUEUE, POST_EMBEDDING_QUEUE, POST_KEYWORDS_QUEUE, POST_TOPIC_QUEUE } from '../helpers';

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
export const emailQueue = new Queue(EMAIL_DELIVERY_QUEUE,{connection:queueConnection});
export const notificationQueue = new Queue(NOTIFICATION_DELIVERY_QUEUE, {connection: queueConnection});
// Never log raw Redis errors: AUTH command arguments may contain credentials.
queueConnection.on('ready',()=>logger.info({event:'queue_connection_ready'},'Redis queue connection ready'));
queueConnection.on('error', err => logger.error({event:'queue_connection_error',err},'Redis queue connection unavailable'));
for (const queue of [appSubscriptionQueue, appSubReminderQueue, postEmbeddingQueue, postTopicQueue, postKeywordsQueue, emailQueue, notificationQueue]) {
  queue.on('error', err => logger.error({event:'queue_error',queue:queue.name,err},'Redis queue unavailable'));
  queue.on('waiting', job => logger.info({event:'job_queued',queue:queue.name,job:job.name,jobId:job.id},'Queue job queued'));
}

export async function closeJobQueues() {
  await Promise.all([appSubscriptionQueue, appSubReminderQueue, postEmbeddingQueue, postTopicQueue, postKeywordsQueue, emailQueue, notificationQueue].map(queue => queue.close()));
  await queueConnection.quit();
}
