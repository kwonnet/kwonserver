import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { APP_SUBSCRIPTION_REMINDER_QUEUE, POST_EMBEDDING_QUEUE, POST_KEYWORDS_QUEUE, POST_TOPIC_QUEUE } from '../helpers';

const connection = new IORedis(String(process.env.REDIS_URL), {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});


export const appSubscriptionQueue = new Queue(APP_SUBSCRIPTION_REMINDER_QUEUE, {
  connection,
});

export const appSubReminderQueue = new Queue(APP_SUBSCRIPTION_REMINDER_QUEUE, {
  connection,
});

export const postEmbeddingQueue = new Queue(POST_EMBEDDING_QUEUE, {
  connection,
});

export const postTopicQueue = new Queue(POST_TOPIC_QUEUE, {
  connection,
});

export const postKeywordsQueue = new Queue(POST_KEYWORDS_QUEUE, {
  connection,
});