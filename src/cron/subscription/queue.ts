import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis({ maxRetriesPerRequest: null });


export const appSubscriptionQueue = new Queue('appSubscriptionQueue', {
  connection,
});

export const appSubReminderQueue = new Queue('appSubReminderQueue', {
  connection,
});
