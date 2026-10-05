import { createHash } from 'node:crypto';
import prisma from "@/db";
import redisClient from "@/redis";
import { SubStatusEnum } from "@prisma/client";
import dayjs from "dayjs";
import {
  appSubReminderQueue,
  appSubscriptionQueue,
  postEmbeddingQueue,
  postTopicQueue,
} from "../jobs/queue";
import logger from "@/logger";
import { delayExecution } from "@/utils/helpers";

const LAST_SCHEDULED_KEY = "appSubLastScheduledJob";

export async function getLastScheduledJob(): Promise<Date | null> {
  const lastScheduled = await redisClient.get(LAST_SCHEDULED_KEY);
  return lastScheduled ? new Date(lastScheduled) : null;
}

export async function updateLastScheduledJob(date: Date): Promise<void> {
  await redisClient.set(LAST_SCHEDULED_KEY, date.toISOString());
}

export async function insertSubscriptionJob(sub: {
  userId: string;
  id: string;
  createdAt: Date;
  endDate: Date;
}, isLastScheduled: boolean = true) {
  try {
    await delayExecution(500)
    logger.info(sub, "Inserting subscription");
    const subscriptionJobName = `sub-${sub.id}`;
    const reminderJobName = `reminder-${sub.id}`;
    // A separate job per billing period avoids removing the active renewal job.
    // BullMQ deduplicates repeated scheduling of this same period.
    const jobId = `subscription-${sub.id}-${new Date(sub.endDate).getTime()}`;
    // calculate date delay
    const now = new Date();
    const nextPaymentDelay = new Date(sub.endDate).getTime() - now.getTime();
    const reminderDelay = nextPaymentDelay - (1000 * 60 * 60 * 24)
    const backoffDelay = 24 * 60 * 60 * 1000
    // Calculate date
    // const nextPaymentDate = dayjs().add(3, "minute");
    // const nextPaymentDelay = nextPaymentDate.diff(dayjs(), "millisecond");
    // const reminderDate = nextPaymentDate.subtract(1, "minute").toDate();
    // const reminderDelay = reminderDate.getTime() - now.getTime();
    // const backoffDelay = 30 * 1000;
    // console.log(nextPaymentDelay / 1000);
    // console.log(reminderDelay / 1000);
    // add delay
    await appSubscriptionQueue.add(
      subscriptionJobName,
      { subscriptionId: sub.id },
      {
        delay: Math.max(0, nextPaymentDelay),
        attempts: 2,
        jobId,
        backoff: { type: "fixed", delay: backoffDelay },
        removeOnComplete: true,
        removeOnFail: {
          age: 24 * 3600, // keep up to 24 hours
        },
      }
    );

    await appSubReminderQueue.add(
      reminderJobName,
      { subscriptionId: sub.id },
      {
        delay: Math.max(0, reminderDelay),
        jobId,
        removeOnComplete: { age: 366 * 24 * 3600 },
        removeOnFail: {
          age: 24 * 3600, // keep up to 24 hours
        },
      }
    );
    if(isLastScheduled) {
        //   update last scheduled job
        await updateLastScheduledJob(new Date(sub.createdAt));
    }

    logger.info(`Inserted Scheduled job for subscription ${sub.id}`);
  } catch (error) {
    logger.error(`Error inserting subscription job ${sub.id}`);
    throw error;
  }
}
export async function addSubscriptionCronJob(subscriptionId: string) {
  try {
    logger.info(`API Scheduled job for subscription ${subscriptionId}`);
    const sub = await prisma.subscription.findUnique({
      where: {
        id: subscriptionId,
        isRecurring: true,
        status: SubStatusEnum.ACTIVE,
      },
      select: {
        isRecurring: true,
        status: true,
        id: true,
        endDate: true,
        userId: true,
        createdAt: true,
      },
    });
    if (!sub) return;
    // insert job
    await insertSubscriptionJob(sub);
  } catch (error) {
    logger.error(`Error adding subscription job ${subscriptionId}`);
  }
}

export async function removeSubscriptionCronJob(arg: {
  userId: string;
  subId: string;
}) {
  const jobId = `${arg.userId.slice(-10)}-${arg.subId.slice(-10)}`;
  try {
    // remove job
    await appSubscriptionQueue.remove(jobId, { removeChildren: true});
    await appSubReminderQueue.remove(jobId, { removeChildren: true});
    logger.info(`Removed Scheduled subscription cron ${jobId}`);
  } catch (error) {
    logger.error(`Error Removing subscription cron job ${jobId}`);
  }
}

export async function addPostEmbeddingCronJob(id: string) {
  try {
    await delayExecution(500)
    logger.info(id, "Inserting post embedding job");
    const jobName = `emb-${id}`;
    const jobId = id
    // remove any old sub & reminder jobs with the same id
    const delJob = await postEmbeddingQueue.remove(jobId, { removeChildren: true});
    logger.info(`Deleting old job for embedding ${id}, job: ${delJob}`);
    // calculate date delay
    const backoffDelay = 5 * 60 * 1000 // 5 minutes

    await postEmbeddingQueue.add(
      jobName,
      { id  },
      {
        delay: 60_000,
        attempts: 2,
        jobId,
        backoff: { type: "fixed", delay: backoffDelay },
        removeOnComplete: true,
        removeOnFail: {
          age: 24 * 3600, // keep up to 24 hours
        },
      }
    );

    logger.info(`Inserted Scheduled job for post embedding ${id}`);
  } catch (error) {
    logger.error(`Error inserting post embedding job ${id}`);
  }
}

export async function removePostEmbeddingCronJob(id: string) {
  try {
    // remove job
    await postEmbeddingQueue.remove(id, { removeChildren: true});
    logger.info(`Removed Scheduled post embedding cron ${id}`);
  } catch (error) {
    logger.error(`Error Removing post embedding cron job ${id}`);
  }
}


export async function addPostTopicCronJob(id: string) {
  try {
    await delayExecution(500)
    logger.info(id, "Inserting post topic job");
    const jobName = `topic-${id}`;
    const jobId = id
    // remove any old sub & reminder jobs with the same id
    const delJob = await postTopicQueue.remove(jobId, { removeChildren: true});
    logger.info(`Deleting old job for post topic ${id}, job: ${delJob}`);
    // calculate date delay
    const backoffDelay = 5 * 60 * 1000 // 5 minutes

    await postTopicQueue.add(
      jobName,
      { id  },
      {
        delay: 60_000,
        attempts: 2,
        jobId,
        backoff: { type: "fixed", delay: backoffDelay },
        removeOnComplete: true,
        removeOnFail: {
          age: 24 * 3600, // keep up to 24 hours
        },
      }
    );

    logger.info(`Inserted Scheduled job for post topic ${id}`);
  } catch (error) {
    logger.error(`Error inserting post topic job ${id}`);
  }
}

export async function removePostTopicCronJob(id: string) {
  try {
    await postTopicQueue.remove(id, { removeChildren: true});
    logger.info(`Removed Scheduled post topic cron ${id}`);
  } catch (error) {
    logger.error(`Error Removing post topic cron job ${id}`);
  }
}

// Content-addressed jobs never remove an active job; edits create a new version.
export async function enqueuePostTopic(id: string, content: string | null, priority = 1) {
  const hash = createHash('sha256').update(content ?? '').digest('hex');
  const jobId = `topic-${id}-${hash}`;
  const existing = await postTopicQueue.getJob(jobId);
  if (existing) {
    if (await existing.getState() === 'failed' && Date.now() - (existing.finishedOn ?? 0) >= 3600_000) await existing.retry();
    return;
  }
  await postTopicQueue.add(`topic-${id}`, { id, contentHash: hash }, {
    jobId, priority, attempts: 4, backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: true, removeOnFail: { count: 500, age: 86400 },
  });
}
