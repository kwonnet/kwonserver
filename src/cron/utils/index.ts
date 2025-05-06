import prisma from "@/db";
import redisClient from "@/redis";
import { SubStatusEnum } from "@prisma/client";
import dayjs from "dayjs";
import {
  appSubReminderQueue,
  appSubscriptionQueue,
} from "../subscription/queue";
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
    const jobId = `${sub.userId.slice(-10)}-${sub.id.slice(-10)}`;
    // remove any old sub & reminder jobs with the same id
    const subRemoved = await appSubscriptionQueue.remove(jobId, { removeChildren: true});
    const reminderRemoved = await appSubReminderQueue.remove(jobId, { removeChildren: true});
    logger.info(
      `Deleting old jobs for subscription ${sub.id}, sub: ${subRemoved}, reminder: ${reminderRemoved}`
    );
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
        delay: nextPaymentDelay,
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
        delay: reminderDelay,
        jobId,
        removeOnComplete: true,
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
