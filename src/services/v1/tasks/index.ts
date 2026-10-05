import prisma from "@/db";
import {randomInt, randomUUID} from "node:crypto";
import {walletOperation, WalletError, requestKey} from "@/services/walletLedger";
import { Prisma, EngagementAction, RewardTypeEnum } from "@prisma/client";

export const checkUserTask = async (userId: string, taskId: string) => {
  try {
    const userTask = await prisma.userTask.findFirst({
      where: { userId, taskId },
      include: { task: true },
    });
    if (userTask) {
      return { data: "Task already done", status: 402 };
    }

    const task = await prisma.task.findFirst({ where: { id: taskId } });

    if (!task) {
      return { data: "Task not found", status: 402 };
    }

    return { data: task, status: 200 };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const insertUserTask = async (userId: string, taskId: string) => {
  try {
    const task = await prisma.userTask.create({ data: { taskId, userId } });

    return { data: task, status: 200 };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const createTask = async (
  task: {
    title: string;
    description: string;
    url: string;
    reward: number;
    code?: string | undefined;
    rewardType: RewardTypeEnum;
  },
  userId: string
) => {
  try {
    const result = await prisma.task.create({ data: { ...task, userId } });

    return { data: result, status: 200 };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const getTasks = async (
  userId: string,
  {
    page,
    limit,
  }: {
    page: number;
    limit: number;
  }
) => {
  try {
    const skip = (page - 1) * limit;

    const result = await prisma.task.findMany({
      where: {
        performedBy: {
          none: {
            userId,
          },
        },
      },
      skip,
      take: limit,
      orderBy: [{ createdAt: "desc" }],
    });

    return result.length === 0
      ? { status: 404, data: "Not found" }
      : { status: 200, data: result };
  } catch (error: any) {
    return {
      status: 500,
      data: "Sorry an error occurred, please try again later.",
    };
  }
};

export const getTask = async (id: string) => {
  try {
    const result = await prisma.task.findFirst({
      where: { id },
    });

    if (!result) return { data: "Not found", status: 404 };

    return { status: 200, data: result };
  } catch (error: any) {
    return {
      status: 500,
      data: "Sorry an error occurred, please try again later.",
    };
  }
};

export const getUserCompletedTasks = async (
    userId: string,
    {
      page,
      limit,
    }: {
      page: number;
      limit: number;
    }
  ) => {
    try {

      const skip = (page - 1) * limit;

      const result = await prisma.userTask.findMany({
        where: {
          userId,
        },
        skip,
        take: limit,
        orderBy: [{ createdAt: "desc" }],
        include: { task: true}
        
      });
  
    //   const result = await prisma.task.findMany({
    //     where: {
    //       performedBy: {
    //         some: {
    //           userId,
    //         },
    //       },
    //     },
    //     skip,
    //     take: limit,
    //     orderBy: [{ createdAt: "desc" }],
    //   });
  
      return result.length === 0
        ? { status: 404, data: "Not found" }
        : { status: 200, data: result.map(r => r.task)};
    } catch (error: any) {
      return {
        status: 500,
        data: "Sorry an error occurred, please try again later.",
      };
    }
  };

const ENGAGEMENT_DAY_MS = 24 * 60 * 60 * 1000;
export async function rotateEngagementRewards(now = new Date()) {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('engagement-reward-day',0))`;
    const tasks = await tx.engagementTask.findMany({where: {rewardDay: {lt: day}}, select: {id: true}});
    for (const task of tasks) await tx.engagementTask.update({where: {id: task.id}, data: {reward: randomInt(1,16), rewardDay: day}});
    return tasks.length;
  });
}
async function engagementTargets(db: Prisma.TransactionClient, userId: string, task: {id: string; action: EngagementAction; target: number}, from: Date, now: Date) {
  const publicPost = Prisma.sql`p.status='PUBLISHED' AND p.scope='ANYONE' AND NOT p."isHidden" AND p."deletedAt" IS NULL AND u.status='ACTIVE' AND NOT u."isPrivate" AND u."deletedAt" IS NULL AND u."deactivatedAt" IS NULL`;
  const posts = Prisma.sql`JOIN "Post" p ON p.id=e."postId" JOIN "User" u ON u.id=p."userId"`;
  const interval = Prisma.sql`e."createdAt">${from} AND e."createdAt"<=${now}`;
  const queries: Record<EngagementAction, Prisma.Sql> = {
    LIKE: Prisma.sql`SELECT e."postId" AS id FROM "LikedPost" e ${posts} WHERE e."userId"=${userId} AND p."userId"<>${userId} AND ${interval} AND ${publicPost}`,
    BOOKMARK: Prisma.sql`SELECT e."postId" AS id FROM "Bookmark" e ${posts} WHERE e."userId"=${userId} AND p."userId"<>${userId} AND ${interval} AND ${publicPost}`,
    COMMENT: Prisma.sql`SELECT e."parentId" AS id FROM "Post" e JOIN "Post" p ON p.id=e."parentId" JOIN "User" u ON u.id=p."userId" WHERE e."userId"=${userId} AND e.kind='REPLY' AND e.status='PUBLISHED' AND e."deletedAt" IS NULL AND NOT e."isHidden" AND p."userId"<>${userId} AND ${interval} AND ${publicPost}`,
    REPOST: Prisma.sql`SELECT e."parentId" AS id FROM "Post" e JOIN "Post" p ON p.id=e."parentId" JOIN "User" u ON u.id=p."userId" WHERE e."userId"=${userId} AND e.kind='REPOST' AND e.status='PUBLISHED' AND e."deletedAt" IS NULL AND NOT e."isHidden" AND p."userId"<>${userId} AND ${interval} AND ${publicPost}`,
    QUOTE: Prisma.sql`SELECT e."parentId" AS id FROM "Post" e JOIN "Post" p ON p.id=e."parentId" JOIN "User" u ON u.id=p."userId" WHERE e."userId"=${userId} AND e.kind='QUOTE' AND e.status='PUBLISHED' AND e."deletedAt" IS NULL AND NOT e."isHidden" AND p."userId"<>${userId} AND ${interval} AND ${publicPost}`,
    PUBLISH: Prisma.sql`SELECT e.id FROM "Post" e JOIN "User" u ON u.id=e."userId" WHERE e."userId"=${userId} AND e.kind='ROOT' AND e.status='PUBLISHED' AND e.scope='ANYONE' AND e."deletedAt" IS NULL AND NOT e."isHidden" AND u.status='ACTIVE' AND NOT u."isPrivate" AND u."deletedAt" IS NULL AND u."deactivatedAt" IS NULL AND ${interval}`,
    FOLLOW: Prisma.sql`SELECT e."followingId" AS id FROM "Follow" e JOIN "User" u ON u.id=e."followingId" WHERE e."followerId"=${userId} AND e."followingId"<>${userId} AND e.status='ACCEPTED' AND e."updatedAt">${from} AND e."updatedAt"<=${now} AND u.status IN ('ACTIVE','PRIVATE') AND u."deletedAt" IS NULL AND u."deactivatedAt" IS NULL`,
    FOLLOWERS: Prisma.sql`SELECT e."followerId" AS id FROM "Follow" e JOIN "User" u ON u.id=e."followerId" WHERE e."followingId"=${userId} AND e."followerId"<>${userId} AND e.status='ACCEPTED' AND e."updatedAt">${from} AND e."updatedAt"<=${now} AND u.status IN ('ACTIVE','PRIVATE') AND u."deletedAt" IS NULL AND u."deactivatedAt" IS NULL`,
    LIKES_RECEIVED: Prisma.sql`SELECT e."userId" AS id FROM "LikedPost" e ${posts} JOIN "User" actor ON actor.id=e."userId" WHERE actor.status IN ('ACTIVE','PRIVATE') AND actor."deletedAt" IS NULL AND actor."deactivatedAt" IS NULL AND p."userId"=${userId} AND e."userId"<>${userId} AND ${interval} AND ${publicPost}`,
    COMMENTS_RECEIVED: Prisma.sql`SELECT e."userId" AS id FROM "Post" e JOIN "Post" p ON p.id=e."parentId" JOIN "User" u ON u.id=p."userId" JOIN "User" actor ON actor.id=e."userId" WHERE actor.status IN ('ACTIVE','PRIVATE') AND actor."deletedAt" IS NULL AND actor."deactivatedAt" IS NULL AND p."userId"=${userId} AND e."userId"<>${userId} AND e.kind='REPLY' AND e.status='PUBLISHED' AND e."deletedAt" IS NULL AND NOT e."isHidden" AND ${interval} AND ${publicPost}`,
  };
  return db.$queryRaw<{id: string}[]>(Prisma.sql`SELECT DISTINCT q.id FROM (${queries[task.action]}) q WHERE q.id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "EngagementCredit" c WHERE c."userId"=${userId} AND c."taskId"=${task.id} AND c."targetId"=q.id) ORDER BY q.id LIMIT ${task.target}`);
}
export async function getEngagementTasks(userId: string) {
  await rotateEngagementRewards();
  const tasks = await prisma.engagementTask.findMany({orderBy: {id: 'asc'}});
  const now = new Date();
  return Promise.all(tasks.map(async task => {
    const claim = await prisma.engagementClaim.findFirst({where: {userId, taskId: task.id}, orderBy: {claimedAt: 'desc'}});
    const from = new Date(Math.max(now.getTime()-ENGAGEMENT_DAY_MS, claim?.claimedAt.getTime() ?? 0));
    const progress = (await engagementTargets(prisma as unknown as Prisma.TransactionClient, userId, task, from, now)).length;
    const nextClaimAt = claim ? new Date(claim.claimedAt.getTime()+ENGAGEMENT_DAY_MS) : null;
    return {...task, progress, nextClaimAt, eligible: task.enabled && progress >= task.target && (!nextClaimAt || nextClaimAt <= now)};
  }));
}
export async function claimEngagementTask(userId: string, taskId: string, idempotencyKey: string) {
  await rotateEngagementRewards();
  return walletOperation(`engagement:${userId}:${taskId}`, requestKey(idempotencyKey), {taskId}, [userId], async tx => {
    await tx.$queryRaw`SELECT id FROM "EngagementTask" WHERE id=${taskId} FOR UPDATE`;
    const task = await tx.engagementTask.findUnique({where: {id: taskId}});
    if (!task || !task.enabled) throw new WalletError('This task is unavailable.',404);
    const now = new Date();
    const claim = await tx.engagementClaim.findFirst({where: {userId, taskId}, orderBy: {claimedAt: 'desc'}});
    if (claim && claim.claimedAt.getTime()+ENGAGEMENT_DAY_MS > now.getTime()) throw new WalletError(`Available again at ${new Date(claim.claimedAt.getTime()+ENGAGEMENT_DAY_MS).toISOString()}`,409);
    const from = new Date(Math.max(now.getTime()-ENGAGEMENT_DAY_MS, claim?.claimedAt.getTime() ?? 0));
    const targets = await engagementTargets(tx,userId,task,from,now);
    if (targets.length < task.target) throw new WalletError(`Progress: ${targets.length}/${task.target}. Complete ${task.target-targets.length} more qualifying actions.`,422);
    const wallet = await tx.wallet.findUniqueOrThrow({where: {userId}});
    if (wallet.isLocked) throw new WalletError('Wallet is locked.');
    await tx.wallet.update({where: {userId}, data: {bonus: {increment: task.reward}}});
    const recorded = await tx.engagementClaim.create({data: {userId, taskId, reward: task.reward, target: task.target, verifiedCount: targets.length, windowStart: from, claimedAt: now}});
    await tx.engagementCredit.createMany({data: targets.map(target => ({userId, taskId, targetId: target.id, claimedAt: now}))});
    await tx.transaction.create({data: {userId,recipientId:userId,walletId:wallet.id,amount:task.reward,txnRef:randomUUID(),currency:'COINS',source:'BONUS',gateway:'VIRTUAL',type:'CREDIT',status:'COMPLETED',category:'APP_TASK',description:`Engagement task: ${task.title}`,metadata:{engagementTaskId:taskId,claimId:recorded.id,bonus:task.reward}}});
    return {reward:task.reward, nextClaimAt:new Date(now.getTime()+ENGAGEMENT_DAY_MS).toISOString(), message:`You earned ${task.reward} bonus coins.`};
  });
}
export async function configureEngagementTask(id: string, input: {enabled?: boolean; target?: number}) {
  return prisma.engagementTask.update({where: {id}, data: input});
}
