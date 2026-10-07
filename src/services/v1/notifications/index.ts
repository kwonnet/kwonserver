import prisma from '@/db';
import { AuthUser } from '@/types/user';
import webpush from '@/utils/webpush';
import { Prisma } from '@prisma/client';
import logger from '@/logger';
import { postNotificationVisibility } from '@/services/recommendation-visibility';
import {logServiceError} from '@/logger/events';

export function publicationNotificationVisibility(userId: string): Prisma.NotificationWhereInput {
  return { OR: [
    { sourceKey: null },
    { sourceKey: { startsWith: 'post-published:' },
      sender: { postNotificationSubscribers: { some: { subscriberId: userId } } },
      AND: [{sender: {followers: {some: {followerId: userId, status: 'ACCEPTED'}}}}],
      post: { is: postNotificationVisibility(userId) } },
  ] };
}

export async function getAuthorNotificationSubscription(authorId: string, subscriberId: string) {
  const subscription = await prisma.postNotificationSubscription.findFirst({where: {subscriberId, authorId, author: {followers: {some: {followerId: subscriberId, status: 'ACCEPTED'}}}}});
  return {status: 200, data: {subscribed: !!subscription}};
}

export async function setAuthorNotificationSubscription(authorId: string, subscriberId: string, enabled: boolean) {
  if (authorId === subscriberId) return {status: 400, data: 'You cannot subscribe to your own posts'};
  if (!enabled) {
    await prisma.postNotificationSubscription.deleteMany({where: {subscriberId, authorId}});
    return {status: 200, data: {subscribed: false}};
  }
  const author = await prisma.user.findFirst({where: {
    id: authorId, status: {in: ['ACTIVE', 'PRIVATE']}, deletedAt: null, deactivatedAt: null,
    NOT: [{blockedUsers: {some: {blockedId: subscriberId}}}, {blockedBy: {some: {blockerId: subscriberId}}}, {mutedBy: {some: {muterId: subscriberId}}}],
    OR: [{status: 'ACTIVE', isPrivate: false}, {followers: {some: {followerId: subscriberId, status: 'ACCEPTED'}}}],
  }, select: {id: true}});
  if (!author) return {status: 404, data: 'This account is unavailable for post notifications'};
  return prisma.$transaction(async tx => {
    // Serialize opt-in against follow deletion so unfollow cannot leave a new subscription behind.
    const follows = await tx.$queryRaw<{id: string}[]>`SELECT "id" FROM "Follow" WHERE "followerId" = ${subscriberId} AND "followingId" = ${authorId} AND "status" = 'ACCEPTED' FOR UPDATE`;
    if (!follows.length) return {status: 403, data: 'Follow this user before enabling post notifications'};
    await tx.postNotificationSubscription.createMany({data: [{subscriberId, authorId}], skipDuplicates: true});
    return {status: 200, data: {subscribed: true}};
  });
}

/** Bounded transactional fanout. A crash rolls back both notifications and cursor. */
export async function fanoutPublishedPostNotifications(postId?: string) {
  for (let batch = 0; batch < 10; batch++) {
    const processed = await prisma.$transaction(async tx => {
      const [event] = await tx.$queryRaw<{postId: string; createdAt: Date; subscriberCursor: string | null}[]>`
        SELECT "postId", "createdAt", "subscriberCursor" FROM "PostPublicationNotification"
        WHERE "completedAt" IS NULL AND (${postId ?? null}::text IS NULL OR "postId" = ${postId ?? null}) ORDER BY "createdAt", "postId" LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (!event) return false;
      const post = await tx.post.findUnique({where: {id: event.postId}, select: {userId: true, status: true, deletedAt: true, isHidden: true, user: {select: {name: true}}}});
      if (!post || post.status !== 'PUBLISHED' || post.deletedAt || post.isHidden) {
        await tx.postPublicationNotification.update({where: {postId: event.postId}, data: {completedAt: new Date()}});
        return {postId: event.postId, scanned: 0, eligible: 0, created: 0};
      }
      // Keep the publication cutoff comparison inside PostgreSQL using the
      // stored timestamp, without converting it through the application clock.
      const subscribers = await tx.$queryRaw<{id: string; subscriberId: string}[]>`
        SELECT s."id", s."subscriberId" FROM "PostNotificationSubscription" s
        JOIN "User" u ON u."id" = s."subscriberId"
        WHERE s."authorId" = ${post.userId}
          AND s."createdAt" <= (SELECT "createdAt" FROM "PostPublicationNotification" WHERE "postId" = ${event.postId})
          AND (${event.subscriberCursor}::text IS NULL OR s."id" > ${event.subscriberCursor})
          AND u."status" IN ('ACTIVE', 'PRIVATE') AND u."deletedAt" IS NULL AND u."deactivatedAt" IS NULL
        ORDER BY s."id" LIMIT 100`;
      const notifications: Prisma.NotificationCreateManyInput[] = [];
      for (const subscription of subscribers) {
        const visible = await tx.post.findFirst({where: {id: event.postId, AND: [postNotificationVisibility(subscription.subscriberId), {user: {followers: {some: {followerId: subscription.subscriberId, status: 'ACCEPTED'}}}}]}, select: {id: true}});
        if (visible) notifications.push({sourceKey: `post-published:${event.postId}:${subscription.subscriberId}`,
          senderId: post.userId, recipientId: subscription.subscriberId, postId: event.postId,
          type: 'POST', action: 'NONE', title: 'New post', message: `${post.user.name.slice(0,80)} published a new post`});
      }
      const created = notifications.length ? (await tx.notification.createMany({data: notifications, skipDuplicates: true})).count : 0;
      await tx.postPublicationNotification.update({where: {postId: event.postId}, data: {
        subscriberCursor: subscribers.at(-1)?.id ?? event.subscriberCursor,
        ...(subscribers.length < 100 ? {completedAt: new Date()} : {}),
      }});
      return {postId: event.postId, scanned: subscribers.length, eligible: notifications.length, created};
    }, {timeout: 30_000});
    if (!processed) return false;
    logger.info({event: "post_notification_fanout_committed", ...processed}, "Post subscriber notification batch committed");
  }
  return !!await prisma.postPublicationNotification.findFirst({where: {completedAt: null, ...(postId ? {postId} : {})}, select: {postId: true}});
}

// Only browser push services may be contacted; arbitrary endpoints are an SSRF risk.
export function validatePushSubscription(body: unknown) {
  if (!body || typeof body !== 'object') throw new Error('Invalid push subscription');
  const input = body as {endpoint?: unknown; keys?: {p256dh?: unknown; auth?: unknown}};
  if (typeof input.endpoint !== 'string' || input.endpoint.length > 2048) throw new Error('Invalid push endpoint');
  const url = new URL(input.endpoint);
  const allowed = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !(allowed.includes(url.hostname) || url.hostname.endsWith('.notify.windows.com'))) throw new Error('Unsupported push endpoint');
  const key = (value: unknown, bytes: number) => typeof value === 'string' && /^[A-Za-z0-9_-]+={0,2}$/.test(value) && Buffer.from(value, 'base64url').length === bytes;
  if (!key(input.keys?.p256dh, 65) || !key(input.keys?.auth, 16)) throw new Error('Invalid push encryption keys');
  return {endpoint: url.href, keys: {p256dh: input.keys!.p256dh as string, auth: input.keys!.auth as string}};
}
export async function subscribePushNotification(body: unknown, user: Pick<AuthUser, 'id' | 'sessionId'>) {
  let config;
  try { config = validatePushSubscription(body); } catch (serviceError) {
    logServiceError("v1/notifications/index", "subscribePushNotification", serviceError);
return {status: 400, data: 'Invalid or unsupported push subscription'};}
  try {webpush.configure?.();} catch (serviceError) {
    logServiceError("v1/notifications/index", "subscribePushNotification", serviceError);
return {status: 503, data: 'Push notifications are not configured on the server'};}
  try {
    // A browser endpoint belongs to the currently selected account, never both accounts.
    await prisma.pushNotification.upsert({where: {endpoint: config.endpoint}, create: {endpoint: config.endpoint, config, userId: user.id, sessionId: user.sessionId ?? null}, update: {config, userId: user.id, sessionId: user.sessionId ?? null}});
    return {status: 200, data: {subscribed: true}};
  } catch (serviceError) {
    logServiceError("v1/notifications/index", "subscribePushNotification", serviceError);
return {status: 500, data: 'Unable to enable notifications'};}
}
export async function unsubscribePushNotification(endpoint: string, user: Pick<AuthUser, 'id' | 'sessionId'>) {
  await prisma.pushNotification.deleteMany({where: {endpoint, userId: user.id}});
}
export async function deliverPendingPushNotifications(postId?: string) {
  const now = new Date();
  // Atomic row leases coordinate immediate and recurring workers across replicas.
  const notifications = await prisma.notification.findMany({where: {...(postId ? {postId, sourceKey: {startsWith: "post-published:"}} : {}), pushSentAt: null, pushAttempts: {lt: 5}, nextPushAttemptAt: {lte: now}}, orderBy: {createdAt: 'asc'}, take: 100});
  const deliver = async (notification: typeof notifications[number]) => {
    const claim = await prisma.notification.updateMany({where: {id: notification.id, pushSentAt: null, nextPushAttemptAt: {lte: now}}, data: {pushAttempts: {increment: 1}, nextPushAttemptAt: new Date(Date.now() + 300_000)}});
    if (!claim.count) return;
    let target = '/notifications';
    if (notification.sourceKey?.startsWith('post-published:')) {
      const current = await prisma.notification.findFirst({where: {id: notification.id,
        recipient: {status: {in: ['ACTIVE', 'PRIVATE']}, deletedAt: null, deactivatedAt: null},
        ...publicationNotificationVisibility(notification.recipientId!),
        sender: {postNotificationSubscribers: {some: {subscriberId: notification.recipientId!, createdAt: {lte: notification.createdAt ?? new Date(0)}}}}},
        select: {post: {select: {id: true, user: {select: {username: true}}}}}});
      if (!current?.post) {
        logger.info({event: "notification_push_cancelled", notificationId: notification.id, userId: notification.recipientId}, "Post push cancelled because subscription or visibility changed");
        await prisma.notification.update({where: {id: notification.id}, data: {pushSentAt: new Date()}});
        return;
      }
      target = `/@${encodeURIComponent(current.post.user.username)}/feed/${encodeURIComponent(current.post.id)}`;
    }
    const subscriptions = notification.recipientId ? await prisma.pushNotification.findMany({where: {userId: notification.recipientId, OR: [{sessionId: null}, {session: {revokedAt: null, expiresAt: {gt: new Date()}, userId: notification.recipientId}}]}, orderBy: {updatedAt: 'desc'}}) : [];
    let retry = false;
    let deliveredDevices = 0;
    for (const subscription of subscriptions) {
      if (notification.pushDeliveredSubscriptionIds?.includes(subscription.id)) continue;
      try {
        const config = validatePushSubscription(subscription.config);
        const response = await webpush.sendNotification(config, JSON.stringify({title: notification.title, body: notification.message, tag: notification.id, url: target}), {TTL: 3600, timeout: 5_000});
        logger.info({event: 'notification_push_provider_accepted', notificationId: notification.id, userId: notification.recipientId, subscriptionId: subscription.id, providerHost: new URL(config.endpoint).hostname, statusCode: response.statusCode}, 'Push provider accepted notification; device display is unconfirmed');
        await prisma.notification.update({where: {id: notification.id}, data: {pushDeliveredSubscriptionIds: {push: subscription.id}}});
        deliveredDevices++;
      } catch (error: any) {
    logServiceError("v1/notifications/index", "deliver", error);

        if (error?.statusCode === 404 || error?.statusCode === 410) await prisma.pushNotification.deleteMany({where: {id: subscription.id}});
        else {retry = true; logger.warn({notificationId: notification.id, subscriptionId: subscription.id, statusCode: error?.statusCode}, 'Push delivery failed; retry scheduled');}
      }
    }
    logger.info({event: retry ? 'notification_push_retry_scheduled' : deliveredDevices ? 'notification_push_accepted' : 'notification_push_no_devices', notificationId: notification.id, userId: notification.recipientId, deviceCount: subscriptions.length, acceptedDevices: deliveredDevices}, retry ? 'Push delivery will retry after lease expires' : 'Push submission processed; device display is unconfirmed');
    if (!retry) await prisma.notification.update({where: {id: notification.id}, data: {pushSentAt: new Date()}});
  };
  // Bound concurrent outbound requests instead of opening one for every subscriber.
  for (let offset = 0; offset < notifications.length; offset += 10) {
    await Promise.all(notifications.slice(offset, offset + 10).map(deliver));
  }
  return notifications.length;
}

/** Publication already committed: Redis failure must never roll back a post. */
export async function enqueuePostPublicationNotification(postId: string) {
  try {
    const {notificationQueue} = await import('@/cron/jobs/queue');
    const jobId = `post-notification-${postId}`;
    const existing = await notificationQueue.getJob(jobId);
    if (existing) {
      if (await existing.getState() === 'failed') await existing.retry();
      return;
    }
    await notificationQueue.add('post-published', {postId}, {jobId, attempts: 3,
      backoff: {type: 'exponential', delay: 5000},
      removeOnComplete: {age: 86400, count: 1000}, removeOnFail: {age: 604800, count: 1000}});
    logger.info({event: 'post_notification_queued', postId, jobId}, 'Post subscriber notification queued');
  } catch (err) {
    logger.error({event: 'post_notification_enqueue_deferred', postId, err}, 'Publication persisted; recurring outbox recovery will retry delivery');
  }
}

export async function deliverPostPublicationNotification(postId: string) {
  if (!postId || typeof postId !== "string") throw new Error("Post notification job requires a post ID");
  // Each fanout transaction is bounded. Drain this publication independently of
  // unrelated feed/email/game jobs; notification uniqueness and leases dedupe recovery.
  while (await fanoutPublishedPostNotifications(postId)) { /* drain remaining subscriber pages */ }
  while (await deliverPendingPushNotifications(postId) === 100) { /* drain due devices */ }
}

/** Authenticated invalidation only: never broadcast recipient notification data. */
export async function getNotificationStreamSnapshot(userId: string) {
  const where: Prisma.NotificationWhereInput = {recipientId: userId, ...publicationNotificationVisibility(userId)};
  const [latest, unseen] = await Promise.all([
    prisma.notification.findFirst({where, orderBy: [{createdAt: 'desc'}, {id: 'desc'}], select: {id: true}}),
    prisma.notification.count({where: {...where, isSeen: false}}),
  ]);
  return {userId, latestNotificationId: latest?.id ?? null, totalUnseenCount: unseen};
}
