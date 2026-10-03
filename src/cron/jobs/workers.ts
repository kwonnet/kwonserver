import prisma from "@/db";
import { Worker } from "bullmq";
import {
  cancelAppSubscription,
  renewAppSubscriptionWithWallet,
} from "@/services/v1/subscriptions";
import { PostStatus, SubStatusEnum } from "@prisma/client";
import IORedis from "ioredis";
import logger from "@/logger";
import { insertSubscriptionJob } from "../utils";
import { APP_SUBSCRIPTION_QUEUE, APP_SUBSCRIPTION_REMINDER_QUEUE, POST_EMBEDDING_QUEUE, POST_KEYWORDS_QUEUE, POST_LABELS, POST_TOPIC_QUEUE } from "../helpers";
import { cleanTextContent, generateEmbedding } from "@/utils/helpers";
import { kwonrecClient } from "@/services/kwonrec";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error("REDIS_URL environment variable is required");
}

export const workerConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null, connectionName: 'kwonserver:worker:jobs' });
workerConnection.on('error', () => logger.warn('Redis worker connection unavailable'));

export const appSubscriptionWorker = new Worker(
  APP_SUBSCRIPTION_QUEUE,
  async (job) => {
    const { subscriptionId: id } = job.data;
    logger.info(`Processing subscription job: ${id}`);
    // check if the subscription exists
    const currentSub = await prisma.subscription.findFirst({ 
      where: { id, status: { notIn: [SubStatusEnum.CANCELLED, SubStatusEnum.EXPIRED] } },
      select: { id: true,  userId: true, endDate: true, createdAt: true }, 
    });
    if (!currentSub) {
      logger.error(`Subscription not found: ${id}`);
      throw new Error(`Subscription not found: ${id}`);
    }
    // try to renew the subscription
    const result = await renewAppSubscriptionWithWallet(id);
    logger.info(
      { status: result.status, message: result.message },
      `Renewing subscription`
    );
    logger.info(`Job attempts made ${job.attemptsMade}`);
    // insert notification
    await prisma.notification.create({
      data: {
        title: "App subscription renewal",
        message: result.message,
        recipientId: currentSub.userId,
        meta: { type: "SUBSCRIPTION" },
      },
    });
    // check if the job has been attempted once
    if (result.isError && job.attemptsMade < 1) {
      logger.warn(`App subscription renewal failed first time ${id}`);
      await prisma.subscription.update({ where: { id }, data: { status: SubStatusEnum.PAYMENT_ERROR } })
      throw new Error(result.message);
    }
    if (result.isError) {
      logger.warn(`App subscription renewal failed second time - ${id}`);
      // cancel subscription
      await cancelAppSubscription({ status: SubStatusEnum.EXPIRED, subId: id });
      // throw
      throw new Error(result.message);
    }
    // Reschedule subscription job again based on the new params and don't set it as the last scheduled job
    // Do not retry an already successful charge if scheduling the next job fails.
    void insertSubscriptionJob(currentSub, false).catch(error => {
      logger.error({ subscriptionId: id, error: error.message }, 'Next subscription job needs rescheduling');
    });
  },
  { connection: workerConnection, autorun: false }
);

export const appSubReminderWorker = new Worker(
  APP_SUBSCRIPTION_REMINDER_QUEUE,
  async (job) => {
    const { subscriptionId: id } = job.data;
    logger.info(`Processing subscription reminder job: ${id}`);
    const currentSub = await prisma.subscription.findUnique({
      where: { id, status: { notIn: [SubStatusEnum.CANCELLED, SubStatusEnum.EXPIRED] } },
      select: { id: true, userId: true, status: true },
    });

    if (!currentSub) {
      throw new Error(`Subscription is inactive or not found`);
    }
    // notify user of upcoming subscription renewal
    await prisma.notification.create({
      data: {
        title: "App subscription reminder",
        message: "Your app subscription payment renewal is due tomorrow.",
        recipientId: currentSub.userId,
        meta: { type: "SUBSCRIPTION" },
      },
    });
    logger.info(`Reminder sent for subscription ${id}`);
  },
  { connection: workerConnection, autorun: false }
);

export const postEmbeddingWorker = new Worker(
  POST_EMBEDDING_QUEUE,
  async (job) => {
    const { id } = job.data;
    logger.info(`Processing post embedding job: ${id}`);
    // get post and thread
    const { thread, ...rest } = await prisma.post.findFirstOrThrow({where: { id, status: { in: [PostStatus.PUBLISHED, PostStatus.SCHEDULED]}, deletedAt: null }, select: {
      id: true,
      content: true,
       thread: {
        select: {
          id: true,
          content: true
        }
       }
    }})

    const posts = [rest, ...thread]?.filter(item => !!item.content)

    if(posts.length === 0){
      logger.warn(`Skipping .. Queued post job not available: ${id}`);
      // throw new Error(`Queued post job not available: ${id}`);
    }

    // const embeddedPosts: { id: string, embedding: any[]} [] = []

    for (let index = 0; index < posts.length; index++) {
      const item = posts[index];
      const text = cleanTextContent(item.content);
      const embedding = await generateEmbedding(text);
      // update db here
      await prisma.$queryRaw`UPDATE "Post" SET embedding = ${embedding} WHERE id = ${item.id}`
    }
    logger.info(`Post embedding job executed - ${id}`);
  },
  { connection: workerConnection, autorun: false }
);

export const postTopicWorker = new Worker(
  POST_TOPIC_QUEUE,
  async (job) => {
    const { id } = job.data;
    logger.info(`Processing post topic job: ${id}`);
    // get post and thread
    const { thread, ...rest } = await prisma.post.findFirstOrThrow({where: { id, status: { in: [PostStatus.PUBLISHED, PostStatus.SCHEDULED]}, deletedAt: null }, select: {
      id: true,
      content: true,
       thread: {
        select: {
          id: true,
          content: true
        }
       }
    }})

    const posts = [rest, ...thread]?.filter(item => !!item.content)

    if(posts.length === 0){
      logger.warn(`Skipping .. Queued post job not available: ${id}`);
      // throw new Error(`Queued post job not available: ${id}`);
    }

    const topicPosts: { id: string, topic: string} [] = []

    for (let index = 0; index < posts.length; index++) {
      const item = posts[index];
      const text = cleanTextContent(item.content);
      // get topic
      const resp = await kwonrecClient.post("/classify", { labels: POST_LABELS, text })
      const result = resp.data as { label: string, score: number}

      if (result.score > 0) topicPosts.push({id: item.id, topic: result.label })
    }
    // update db
    await prisma.$transaction(
      topicPosts.map(item =>
        prisma.post.update({
          where: { id: item.id },
          data: {
            topic: item.topic
          }
        })
      )
    )
    logger.info(`Post topic job executed - ${id}`);
  },
  { connection: workerConnection, autorun: false }
);

export const postKeywordsWorker = new Worker(
  POST_KEYWORDS_QUEUE,
  async (job) => {
    const { id } = job.data;
    logger.info(`Processing post keyword job: ${id}`);
    // get post and thread
    const { thread, ...rest } = await prisma.post.findFirstOrThrow({where: { id, status: { in: [PostStatus.PUBLISHED, PostStatus.SCHEDULED]}, deletedAt: null }, select: {
      id: true,
      content: true,
       thread: {
        select: {
          id: true,
          content: true
        }
       }
    }})

    const posts = [rest, ...thread]?.filter(item => !!item.content)

    if(posts.length === 0){
      logger.warn(`Skipping .. Queued post job not available: ${id}`);
      // throw new Error(`Queued post job not available: ${id}`);
    }

    const processedPosts: { id: string, topic: string} [] = []

    for (let index = 0; index < posts.length; index++) {
      const item = posts[index];
      const text = cleanTextContent(item.content);
      // get topic
      const resp = await kwonrecClient.post("/classify", { labels: POST_LABELS, text })
      const result = resp.data as { label: string, score: number}

      if (result.score > 0) processedPosts.push({id: item.id, topic: result.label })
    }
    // update db
    // await prisma.$transaction(
    //   topicPosts.map(item =>
    //     prisma.post.update({
    //       where: { id: item.id },
    //       data: {
    //         topic: item.topic
    //       }
    //     })
    //   )
    // )
    logger.info(`Post topic job executed - ${id}`);
  },
  { connection: workerConnection, autorun: false }
);
